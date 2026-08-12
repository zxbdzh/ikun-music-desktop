# 播客 ASR 进度、状态与手动中止设计

## 背景

IKUN Music 已支持手动生成播客逐字稿、全局单并发 ASR 队列、30 秒音频分片、部分结果落盘和失败后续传。当前节目列表每秒查询一次转写状态，但界面只能显示“生成中”“检查模型”“队列中”等笼统文案。用户无法区分任务仍在排队、已经开始运行、正在处理哪个片段或后台是否失去响应。

本设计只增强 IKUN Music 的 ASR 可观测性、取消和恢复能力。BetterLyrics 继续只读取 IKUN Music Open API 提供的当前播放内容及时间轴字幕，不承担模型管理、音频处理或转写任务。

## 目标

- 明确显示任务是否已经开始运行。
- 在识别阶段显示当前片段、已完成片段、总片段和完成百分比。
- 显示本次任务已运行时间，以及后台最近一次存活时间。
- 当前片段 30 秒没有产出时给出提示，但不自动终止任务。
- 支持用户取消尚未运行的排队任务，或手动中止正在运行的任务，并保留已经完成的字幕片段。
- 中止或失败后可以继续生成，并跳过已经完成的片段。
- 保持现有全局单并发队列，不让多个 FFmpeg 或 Whisper 进程同时争用资源。
- 保持 Open API transcript protocol v2 兼容，BetterLyrics 无需配合修改。

## 非目标

- 不提供预计剩余时间。当前不同语言、模型、CPU/GPU 和音频质量的速度差异较大，短期估算不可靠。
- 不展示精确队列位置。现有队列会根据当前播放位置动态调整分片优先级，位置会频繁变化。
- 不把 ASR 逻辑迁移到 BetterLyrics。
- 不改变模型选择、语言自动识别、音频缓存目录或下载目录功能。
- 不增加并行 ASR。

## 现有实现约束

- `PodcastModule` 持有每个节目的内存状态、ASR 作业和全局 `PriorityTaskQueue`。
- `PodcastAsr` 负责音频下载、模型准备、FFmpeg 切片和 whisper.cpp 识别。
- 一个节目会先排入 prepare 任务，然后一次性排入所有未完成片段任务。
- `TranscriptionStatus.updatedAt` 只在阶段或片段进度发生变化时更新，无法作为稳定的存活信号。
- `run()` 直接启动子进程，没有接收 `AbortSignal`。
- UI 以 `transcriptState === 'preparing'` 决定是否继续轮询，不能表达“部分结果已保留但任务已取消”。

## 总体设计

保持“渲染进程每秒轮询，主进程返回权威状态”的现有方式。主进程为每个 ASR 作业增加一个 `AbortController` 和一组生命周期时间戳；活动任务每 5 秒刷新存活心跳。UI 不推测后台内部阶段，只根据返回状态渲染。

取消排队或手动中止通过现有 `transcription-control` 命令进入主进程。主进程移除该节目的待执行队列项，并终止正在运行的下载、FFmpeg 或 Whisper 操作。用户主动中止被识别为正常终止，不进入普通失败分支。

部分字幕继续使用现有 `TranscriptSnapshot` 落盘。中止时快照保持 `state: 'preparing'` 和 `isPartial: true`，并写入 `interruptionReason: 'cancelled'`。这使 BetterLyrics 仍能读取已生成的时间轴行，同时 IKUN 重启后也能恢复“已中止、可继续”的状态。

## 状态契约

### 阶段

扩展 `TranscriptionStage`：

```ts
type TranscriptionStage =
  | 'idle'
  | 'queued'
  | 'downloading-audio'
  | 'preparing-model'
  | 'converting-audio'
  | 'recognizing'
  | 'saving'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed'
```

`TranscriptState` 不增加新枚举值，避免改变 BetterLyrics 已使用的 transcript protocol v2。`cancelled` 只属于 IKUN 的转写控制状态。

### 状态字段

在 `TranscriptionStatus` 中增加：

```ts
queuedAt?: number
startedAt?: number
lastHeartbeatAt?: number
lastSegmentCompletedAt?: number
currentSegmentStartedAt?: number
```

- `queuedAt`：用户发起本次任务的时间。
- `startedAt`：prepare 任务真正从全局队列取出并开始执行的时间。排队时不存在。
- `lastHeartbeatAt`：后台活动任务最近一次存活心跳，活动期间至少每 5 秒更新一次。
- `lastSegmentCompletedAt`：最近一次片段成功保存的时间；尚未产出片段时不存在。
- `currentSegmentStartedAt`：当前片段真正开始执行的时间，用于判断该片段是否已经处理超过 30 秒。
- `updatedAt`：任意状态对象最后一次发布的时间，继续保留用于刷新和诊断。
- `progress`：当前阶段进度。模型下载阶段表示模型下载比例；识别阶段表示 `completedSegments / totalSegments`。

在 `TranscriptSnapshot` 中增加可选字段：

```ts
interruptionReason?: 'cancelled'
```

开始或继续生成时清除该字段。普通错误仍使用现有 `state: 'failed'` 和 `error` 字段。

### 状态转换

```text
idle/failed/cancelled
        |
        | start/retry
        v
      queued ----------------------> cancelled
        |                               ^
        v                               |
downloading audio -> preparing model -> converting -> recognizing -> saving -> completed
        |                  |                |             |
        +------------------+----------------+-------------+----> cancelling
        |                  |                |             |          |
        +------------------+----------------+-------------+--------> failed
```

- 用户点击“取消排队”后，排队任务直接变为 `cancelled`。
- 用户点击“中止转写”后，活动任务先变为 `cancelling`；异步操作退出并保存当前快照后变为 `cancelled`。
- 取消不是失败，不设置错误文案。
- 任意非取消异常进入 `failed`，并保留已经完成的片段与原始错误。
- `completed` 和发布者字幕不允许取消。

## 主进程组件

### ASR 作业句柄

`PodcastAsrJob` 增加：

```ts
controller: AbortController
queuedAt: number
startedAt?: number
heartbeatTimer?: ReturnType<typeof setInterval>
cancelRequested: boolean
```

作业句柄是取消和心跳的唯一所有者。`finally` 必须停止计时器并从 `asrJobs` 删除当前句柄，防止旧任务覆盖同一节目的新任务。

### 可取消队列

`PriorityTaskQueue` 增加按任务 ID 或前缀取消待执行任务的能力。取消时从 `tasks` 中移除匹配项，并以专用 `PodcastAsrCancelledError` 拒绝对应 Promise。

队列不会强行处理正在执行的函数。活动任务由作业的 `AbortController` 终止。这样队列仍只负责调度，ASR 作业负责生命周期。

任务 ID 继续使用现有格式：

- `<episodeId>:prepare`
- `<episodeId>:segment-<index>`

取消一个节目时，移除以上述 `<episodeId>:` 为前缀的所有待执行任务，不影响其他节目。

### 可取消 I/O 和子进程

以下调用链都接收同一个 `AbortSignal`：

- `PodcastStorage.downloadEpisode(..., signal)`：把 signal 传给 `fetch` 和 `pipeline`；保留 `.part` 文件以便下次断点续传。
- `PodcastAsr.ensureModel(..., signal)`：把 signal 传给 `fetch` 和响应体读取；未完成模型只保留临时文件，不覆盖已校验模型。
- `PodcastAsr.transcribeSegment(..., signal)`：FFmpeg 和 Whisper 启动前检查 signal，并把 signal 传给 `run()`。
- `run(command, args, signal)`：signal 中止时终止直接子进程；退出事件只结算一次，避免 abort 与 exit 重复 resolve/reject。

所有中止路径统一转换为 `PodcastAsrCancelledError`。运行任务的 catch 先识别该错误，再区分取消和普通失败。

### 心跳与片段产出

prepare 任务真正开始时设置 `startedAt`，随后启动 5 秒心跳计时器。计时器只更新 `lastHeartbeatAt` 和 `updatedAt`，不修改阶段、百分比或字幕 revision。

每个片段开始时同时设置 `currentSegment` 和 `currentSegmentStartedAt`；成功写入数据库后增加 `completedSegments`，更新 `progress` 和 `lastSegmentCompletedAt`。只有数据库写入成功才算片段完成，避免界面先显示进度、字幕却尚未保存。

排队任务不发送心跳。UI 因此可以通过 `startedAt` 是否存在准确区分排队和已经运行。

### 取消排队与手动中止流程

`transcription-control` 的 `command` 增加 `cancel`。后端使用同一命令，界面根据任务是否已经开始分别显示“取消排队”或“中止转写”：

1. 查找 `asrJobs` 中的节目作业；不存在时返回当前状态，不创建新任务。
2. 排队任务直接进入取消流程；活动任务先发布 `cancelling` 状态并设置 `cancelRequested`。
3. 取消该节目的所有待执行队列项。
4. 调用 `controller.abort()` 终止当前 I/O 或子进程。
5. 等待作业 catch 分支读取最新快照。
6. 将快照保存为 `state: 'preparing'`、`isPartial: true`、`interruptionReason: 'cancelled'`，保留 `lines` 和 `completedSegmentIndexes`。
7. 发布 `cancelled` 状态并释放作业句柄，队列继续执行下一个节目。

多次点击取消或中止必须幂等：`cancelling` 或 `cancelled` 状态下再次请求只返回当前状态。

### 继续生成

取消后的“继续生成”沿用 `start` 命令，不新增另一套恢复命令。`startAsrJob(restart: false)` 读取已保存快照、清除 `interruptionReason`，并使用 `completedSegmentIndexes` 跳过已完成片段。

“重新生成”仍使用 `restart`，明确清空现有 ASR 片段。发布者字幕保持不可重新生成的现有约束。

## 渲染进程界面

每个节目沿用现有单行操作区，但把状态拆成主状态、进度和辅助信息，避免继续拼接一串含义冲突的词。

### 排队

```text
排队中 · 等待全局转写队列                    [取消排队]
```

不显示“检查模型”，因为模型检查尚未真正开始。

### 模型准备

```text
正在下载 medium 模型 · 42%                   [中止转写]
████████░░░░░░░░░░░░
已运行 00:18 · 后台运行中
```

已有且校验通过的模型显示“模型已就绪”，随后进入音频处理或识别阶段。

### 转写

```text
正在转写 · 6/18 · 33%                        [中止转写]
███████░░░░░░░░░░░░░
已运行 03:42 · 当前处理第 7 段 · 后台运行中
```

当前片段在 30 秒内没有完成时增加黄色辅助提示：

```text
当前片段已处理超过 30 秒，转写可能较慢或卡住
```

该提示依据 `currentSegmentStartedAt`，不会自动取消。若 `lastHeartbeatAt` 也超过 30 秒没有更新，则将辅助信息改为更强的“后台长时间没有响应”，仍由用户决定是否取消。

### 中止和失败

```text
已中止 · 已完成 6/18 · 33%                       [继续生成]
```

```text
转写失败 · 已完成 6/18 · Whisper 退出码 1         [继续生成]
```

手动中止时按钮短暂显示“正在中止”并禁用，防止重复操作。失败信息保留后端返回的具体原因，但限制单行长度并提供完整文本提示。

### 轮询规则

- `queued`、所有活动阶段和 `cancelling`：每秒轮询。
- `cancelled`、`completed`、`failed`、`idle`：停止持续轮询。
- 用户点击开始、继续、取消排队或中止转写后立即请求一次状态，然后进入对应轮询规则。
- 页面卸载或切换节目源时清理定时器，避免重复轮询。

UI 通过本地当前时间计算已运行时长和 30 秒阈值，不需要后端每秒生成新状态。

## 错误处理

- 用户取消与运行错误使用不同的错误类型和状态分支，取消不显示红色失败提示。
- 取消后如果保存部分快照失败，状态进入 `failed` 并显示保存错误，因为此时无法保证部分结果可恢复。
- 子进程中止和自然退出可能同时触发时，`run()` 只能结算 Promise 一次。
- 音频 `.part` 文件保留用于续传；模型文件只有校验通过后才能原子替换正式文件。
- 应用关闭时复用取消流程终止活动子进程，但不等待长时间网络操作；下次启动从已落盘片段恢复。
- 状态轮询失败只显示本次查询错误，不把后台任务直接标记为失败；下一次轮询可以恢复。

## 兼容性

- transcript descriptor 和 delta 继续使用 `protocolVersion: 2`。
- `TranscriptState` 取值不变，取消后的部分稿对 BetterLyrics 仍表现为 `preparing + isPartial`。
- `interruptionReason` 只保存在 IKUN 的完整快照中，不加入 BetterLyrics 读取的 descriptor 或 delta。
- BetterLyrics 不需要新增菜单、按钮、模型状态或取消命令。
- 已存在的 `failed` ASR 快照仍按原逻辑显示失败并可继续生成。

## 测试策略

### `asr.test.ts`

- 队列能按 episode 前缀移除尚未执行的 prepare 和 segment 任务。
- 取消一个节目不会移除其他节目的任务。
- 活动任务结束后队列继续执行下一项。
- 已中止的子进程返回 `PodcastAsrCancelledError`，不被包装为普通失败。
- signal 已中止时不会再启动 FFmpeg 或 Whisper。

### `module.test.ts`

- 排队状态没有 `startedAt`，任务实际开始后才设置。
- 活动任务每 5 秒刷新 `lastHeartbeatAt`。
- 片段开始时更新 `currentSegmentStartedAt`，成功落盘后才更新 `completedSegments` 和 `lastSegmentCompletedAt`。
- 取消排队任务后不执行 ASR，并发布 `cancelled`。
- 手动中止运行任务后保留 `lines` 和 `completedSegmentIndexes`。
- 手动中止不会进入普通 `failed` 分支，也不会覆盖已有错误之外的节目状态。
- 继续生成只处理未完成片段，并清除 `interruptionReason`。
- 重复取消是幂等操作。
- 一个节目取消后，全局队列继续运行下一个节目。

### 渲染层

- 为状态格式化和轮询判断提取纯函数并编写单元测试。
- 验证排队、模型下载、识别、30 秒慢片段、心跳中断、中止中、已中止、失败和完成文案。
- 验证进度始终限制在 0 到 100%，缺少总片段时不显示虚假的 0%。
- 验证“取消排队”“中止转写”和“继续生成”按钮只在允许的状态出现。
- 验证多个节目同时排队时只有活动任务显示“后台运行中”。

### 回归

- 运行全部播客测试。
- 执行 TypeScript/生产构建，确认公共类型和 IPC 命令分支完整。
- 手工验证首次模型下载、已有模型、本地音频缓存、中文、英文和中英夹杂节目。
- 手工验证 IKUN 播放过程中 BetterLyrics 仍能读取部分稿和完成稿，时间轴跟随不受影响。

## 验收标准

- 用户点击生成后能立即看出任务是排队还是已经运行。
- 识别阶段稳定显示当前片段、总片段、完成片段和百分比。
- 活动任务显示已运行时间，并能通过 5 秒心跳确认后台仍在工作。
- 当前片段 30 秒未完成时出现提示，任务继续运行。
- 用户可以取消排队任务，也可以通过“中止转写”手动终止运行中的任务；活动子进程终止后全局队列继续。
- 取消后的已完成字幕不丢失，点击“继续生成”只补齐缺失片段。
- 普通失败仍显示具体错误，不与用户取消混淆。
- BetterLyrics 无需升级即可继续显示 IKUN 提供的逐字稿。
