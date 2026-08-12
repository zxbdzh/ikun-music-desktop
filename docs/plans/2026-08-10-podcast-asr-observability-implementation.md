# 播客 ASR 可观测性与手动中止实施计划

设计依据：`docs/specs/2026-08-10-podcast-asr-observability-design.md`

## 1. 公共状态契约

- 修改 `src/common/types/podcast.d.ts`。
- 为 `TranscriptionStage` 增加 `cancelling`、`cancelled`。
- 为 `TranscriptionStatus` 增加排队、开始、心跳、片段开始和片段完成时间。
- 为 `TranscriptSnapshot` 增加 `interruptionReason?: 'cancelled'`。
- 为 `transcription-control` 增加 `cancel` 命令。

## 2. ASR 执行层

- 修改 `src/main/modules/podcast/asr.ts`。
- 增加 `PodcastAsrCancelledError` 和统一的取消错误判断。
- `PriorityTaskQueue` 支持按任务 ID 前缀取消待执行项。
- `prepare`、模型下载、分片识别和子进程执行接受 `AbortSignal`。
- 取消 FFmpeg/Whisper 时只结算一次 Promise，Vulkan 回退不吞掉取消。
- 修改 `src/main/modules/podcast/storage.ts`，让音频 fetch 和 pipeline 响应取消并保留 `.part`。

## 3. 作业生命周期

- 修改 `src/main/modules/podcast/module.ts`。
- 每个作业持有 `AbortController`、生命周期时间戳和 5 秒心跳计时器。
- prepare 真正开始时写入 `startedAt`；片段开始和落盘分别更新时间。
- 实现排队取消、运行中止、幂等请求、部分快照落盘和继续生成。
- 失败与用户中止走独立分支；作业结束后继续全局队列。

## 4. 用户界面

- 修改 `src/renderer/views/Podcast/index.vue`。
- 主状态分别显示排队、模型准备、音频处理、转写、中止、失败和完成。
- 活动状态显示百分比、当前片段、已运行时间和后台心跳。
- 当前片段超过 30 秒显示慢片段提示；心跳超过 30 秒显示无响应提示。
- 排队显示“取消排队”，运行显示“中止转写”，终止后显示“继续生成”。
- 轮询依据 stage，而不是只依据 transcriptState。

## 5. 验证

- 扩展 `src/main/modules/podcast/asr.test.ts`：队列取消、隔离和继续调度。
- 扩展 `src/main/modules/podcast/module.test.ts`：排队取消、运行中止、部分结果保留、继续生成、时间戳和幂等。
- 为渲染状态纯函数添加测试，覆盖文案、按钮和 30 秒阈值。
- 运行全部播客测试、类型/生产构建和完成度审计。
