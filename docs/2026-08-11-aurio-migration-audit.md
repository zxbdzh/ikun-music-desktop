# AurioClub 到 IKUN 播客移植与分享审计报告

- 更新日期：2026-08-12
- Apifox 项目：`8689463`（AurioClub API）
- 审计对象：AurioClub 原站、IKUN Music Desktop、BetterLyrics、Apifox 项目资源与 GitHub 门禁
- 审计范围：18 个 HTTP 接口、42 个 Schema、9 个环境、客户端业务链路、长逐字稿分享、桌面 UI/UX、自动化测试与构建

## 执行结论

> IKUN 已完成 AurioClub 18 个接口的客户端功能映射和主要用户流程接入，带时间轴的播客长逐字稿已支持分页、范围导出、失败续传和文章地址优先分享，实机 UI/UX 在本轮验证范围内设计合理。BetterLyrics 已接入 IKUN v2 播客逐字稿，并完成长歌词图片分页分享。Apifox 的接口、Schema、环境、Mock、测试用例、场景、套件和报告等核心资源迁移完整，但重复响应、摘要计数、Apifox 分支治理与 GitHub Environment Secret 仍需整改。

| 对象 | 判定 | 依据 |
|---|---|---|
| IKUN 客户端 | 功能完整 | 18 个接口均有实现映射；17 个进入实际用户流程，单条进度接口作为批量同步兼容入口保留；账户、同步、发现、资料库、播放、下载、逐字稿与分享链路已接通 |
| IKUN 长内容分享 | 功能完整，设计合理 | 逐字稿选择和分享卡片均分页；支持闭区间范围导出、失败续传、仅重试失败页、稳定快照、取消、键盘操作、44px 控件与 reduced-motion |
| BetterLyrics 长内容分享 | 功能完整 | 按卡片样式容量分页；支持当前页、全部页、闭区间范围、进度、取消、失败页重试和导出快照 |
| Apifox 项目 | 核心迁移完整，治理整改中 | 18 个接口、18 个 Mock、22 条用例、1 个全接口场景、1 个非空套件和 1 份云报告均存在且通过；两处重复响应和治理配置尚未闭环 |

## 18 接口迁移矩阵

| # | Apifox 接口 | IKUN 实现与用户入口 | 判定 |
|---:|---|---|---|
| 1 | `GET /auth/me` | `me()`；启动恢复会话、登录后复核账号 | 完整 |
| 2 | `PUT /auth/profile` | `updateProfile()`；账户资料表单 | 完整 |
| 3 | `POST /auth/send-code` | `sendCode()`；验证码登录、注册、重置密码 | 完整 |
| 4 | `POST /auth/login-password` | `loginPassword()`；密码登录 | 完整 |
| 5 | `POST /auth/login-email` | `loginEmail()`；验证码登录 | 完整 |
| 6 | `POST /auth/register-password` | `registerPassword()`；注册并登录 | 完整 |
| 7 | `POST /auth/reset-password` | `resetPassword()`；忘记密码流程 | 完整 |
| 8 | `POST /auth/change-password` | `changePassword()`；账户安全表单 | 完整 |
| 9 | `POST /auth/link-device` | `linkDevice()`；设备关联后同步 | 完整 |
| 10 | `GET /sync/pull` | `pull()`；请求携带 Bearer，并使用水位回退窗口 | 完整；Apifox Bearer 已补齐 |
| 11 | `POST /sync/progress` | `pushProgress()` | 契约完整；运行时由批量接口替代 |
| 12 | `POST /sync/progress/batch` | `pushProgressBatch()`；批量同步脏状态 | 完整 |
| 13 | `POST /sync/preferences` | `pushPreferences()`；同步分组与订阅快照 | 完整 |
| 14 | `GET /podcasts` | `catalog()`；发现目录并合并本地订阅状态 | 完整 |
| 15 | `GET /stats/popular-sources` | `popularSources()`；周期和指标切换 | 完整 |
| 16 | `GET /proxy` | `proxyText()`；RSS、章节和发布者逐字稿 | 完整 |
| 17 | `POST /track` | `track()`；按 `204 No Content` 处理 | 完整 |
| 18 | `GET /api/itunes-search` | `searchItunes()`；失败时回退官方 API | 完整 |

接口实现统一处理响应信封、HTTP 状态、业务 `code`、`trace_id`、超时和错误归一化；iTunes、代理文本与 204 分别走原始 JSON、文本和空响应分支。请求字段与 Schema 的 snake_case 契约一致。代理和下载入口拒绝带凭据、本机及私网 URL。

## 原站与业务功能对照

使用用户授权的临时登录态对 `https://app.aurioclub.com/` 做了只读核对。凭证未写入仓库、报告或日志；`/auth/me` 与 `/sync/pull` 返回 200，页面未观察到应用脚本错误。

原站的时间线、发现、排行榜、搜索/RSS、最近播放、收藏、订阅与分组、导入导出、账户、主题、语言和云同步，在 IKUN 中均有对应入口或等价桌面流程。IKUN 没有复制网页布局，而是将能力放入现有播放器导航、资料库、播放队列和设置体系中。收藏和历史资料库首批只创建 50 项控件，之后每次渐进加载 50 项，避免一次渲染数百个操作按钮。

## 长逐字稿与分享

### IKUN

- 默认选择完整逐字稿；选择列表 `40 条/页`，支持方向键、PageUp/PageDown、Home/End、空格、Enter 和页码直接跳转。
- 分享卡片按最多 5 行、120 个展示字符分页；超长正文和翻译按 Unicode 字素簇拆分，不破坏 Emoji、组合字符或无空格 URL。
- 支持当前页复制、当前页保存、全部页保存和闭区间页码范围保存；空起止值恢复为合法默认范围，反向或越界值会归一化。
- 导出冻结分页、节目元数据、封面、二维码、分享 URL、样式和翻译开关；目录、文件名和快照在恢复任务时复用，避免切歌或异步刷新混入新状态。
- 取消在页面边界生效，已完成文件保留；失败后可从失败页继续，也可只重试失败页，再继续剩余范围。
- 失败、进度和恢复动作使用 live region；导出期间禁用冲突操作，关闭弹窗会先请求取消。
- Electron 实机加载 V88 的 1,520 条逐字稿：选择列表 38 页，分享卡片 314 页；`999` 归一到末页、`0` 归一到首页。
- PageDown/PageUp、空格选择、焦点首尾循环、Escape 关闭、焦点回收、目录取消、重复点击、批量取消、失败恢复和 A→B→A 异步竞态均通过。
- 原始文章地址缺失时，实机卡片显示“扫码打开音频”，并回退到 enclosure 音频地址。

### BetterLyrics

- `AncientBook`：2 行、每行 15 个展示字符、每页 30 个字符；`BambooSlips`：4 行、每行 15 个展示字符、每页 60 个字符。
- 其余 23 个样式高度随内容自适应，分页上限为 6 行、每行 240 个展示字符、每页 240 个字符。
- 原文与译文按时间轴保持配对；超长文本按字素簇无损拆分，不插入人工省略号，不生成空白页。
- 切换样式后按当前页起始字符锚点定位，不机械保留旧页码；NumberBox 支持直接跳页。
- 支持当前页、全部页和闭区间范围保存；导出冻结分页、标题、作者、封面、强调色、样式与字体。
- 单页事务写入，批量页先写临时文件再改名；支持实时进度、取消、仅重试失败页、页面卸载取消和焦点恢复。
- 元数据请求带 generation，旧内容不能覆盖新内容；导出结束后再应用期间积累的歌词或元数据变化。

BetterLyrics 分享模板当前显示原文与译文，不显示 `TertiaryText` 音译层。BetterLyrics 的分享产物是图片文件，没有“返回文章或音频链接”的协议；链接选择属于 IKUN 分享卡片职责。

### 博客适配边界

本轮已实现的是“带时间轴的播客逐字稿作为长歌词分页分享”，来源包括发布者逐字稿和 IKUN 本地 ASR；IKUN v2 增量协议可把这类逐字稿交给 BetterLyrics。普通 RSS/Atom 博客的 `description` 或 `content:encoded` 正文目前只作为单集描述保存，不会自动转换成时间轴歌词，也不会直接进入两端歌词卡片。因而不能把本轮结论表述为“任意博客正文均可分享”。

## 分享链接语义

IKUN 的 RSS 解析、数据库迁移和读写链路保留单集原始文章地址：

1. 优先使用 RSS `<link>`、Atom alternate link 或有效 permalink GUID。
2. RSS 2.0 的 `guid@isPermaLink` 缺省按 `true` 处理；显式 `false` 时不作为文章链接。
3. 只有真实 GUID 可参与永久链接判断，不能把用于内部 ID 回退的 enclosure 音频误当文章地址。
4. 分享前解码 HTML 实体，并通过 `URL` 校验仅接受 HTTP(S)，同时拒绝内嵌凭据。
5. 文章地址缺失或无效时回退 enclosure 音频；卡片明确显示“扫码打开音频”。

复制链接与二维码使用同一解析结果。文章和音频地址均无效时，不生成伪造地址。

## UI/UX 审计

按 `ui-ux-pro-max` 的可访问性、触控目标、长内容布局、焦点管理、错误恢复和 reduced-motion 规则复核，IKUN 分享流程的最终判定为：**功能完整，UI/UX 设计合理**。

- 页面保持桌面音乐工具的紧凑信息密度，没有新增营销式页面、装饰性卡片或嵌套卡片。
- 分页使用熟悉的前后图标和页码输入；首尾页采用原生禁用语义，图标按钮有辅助名称或工具提示。
- PlayDetail 分享入口、弹窗分页、范围输入、取消、恢复和关闭控件均达到约 44px 命中区。
- 动态内容使用稳定尺寸，页码和进度不推动周围布局；750×800 窄视口和 1115×719 常规视口均无横向溢出或控件重叠。
- 长文本拆成可扫描页面，页码位于独立页脚，正文不被遮挡；范围摘要与恢复状态就地显示。
- 异步导出提供实时状态、取消和明确恢复路径；错误不仅说明失败，还提供“继续剩余页”或“仅重试失败页”。
- 初始焦点、Tab/Shift+Tab 循环、Escape 退出、关闭后焦点回收和动态 live region 符合桌面模态交互预期。
- 页面和预览切换动画显式响应 `prefers-reduced-motion`；实机控制台为 0 error。

结论边界：本轮不是全应用 WCAG、所有明暗主题、系统字体放大或触屏设备认证。BetterLyrics 尚无自动化 UI 像素测试；IKUN 资料库虽然只渐进渲染 50 项，但主进程仍全量查询并跨 IPC 返回资料库内容，超大本地库仍可继续优化为后端分页和轻量摘要。

## Apifox 完整度与治理缺口

Apifox CLI 2.2.9 最新回读：

| 资源 | 数量 |
|---|---:|
| HTTP 接口 | 18 |
| Schema | 42 |
| 环境 | 9 |
| Mock | 18 |
| 单接口测试用例 | 22 |
| 测试场景 | 1 |
| 测试套件 | 1 |
| 测试报告 | 1 |
| Runner | 0 |
| 定时任务 | 0 |

核心迁移判定：

- 18 个接口都有默认成功 Mock；22 条用例覆盖 18 条成功路径和 4 条鉴权、参数或限流负路径。
- “AurioClub 全接口契约回归”包含 22 个启用的 HTTP 步骤；非空套件静态引用该场景；云报告 `25268012` 状态为 `done`。
- `/sync/pull` Bearer 与 `/proxy` XML/附加媒体类型契约已按 `cli-schema get -> validate -> update -> get` 闭环修正。
- 当前隔离回归为 22/22 步骤、22/22 实际请求、63/63 断言通过，0 个非本机请求；运行结束后 `127.0.0.1:48765` 无监听残留。
- Runner 与 Apifox 原生定时任务为 0 是明确的“不采用”，不是迁移遗漏；仓库使用 GitHub Actions 启动隔离 Mock 并执行契约回归。

治理缺口：

1. `project get` 的 `endpointCount`、`testCaseCount`、`testScenarioCount`、`testSuiteCount` 均错误返回 0，与各资源列表的 18、22、1、1 不一致。
2. `/podcasts` 仍有重复 200 响应 `165266986`；`/stats/popular-sources` 仍有重复 200 响应 `166940786`。删除属于破坏性操作，本轮未在没有单独确认的情况下执行。
3. Apifox `main` 仍为 `isProtected=false`，项目允许自动化写主分支。
4. GitHub Environment `aurio-contract-regression` 已存在，且部署分支策略仅允许 `main`；实时回归工作流已声明该 Environment。
5. GitHub `main` 已启用 Require pull request、管理员强制、会话解决和严格的 `Contract verifier unit` Required Status Check。
6. PR `#1` 已通过 `Contract verifier unit` 并以 merge 方式合入 `main`；两个 Aurio 工作流已经进入远端主分支。
7. `APIFOX_ACCESS_TOKEN` Environment Secret 仍为 0 个。合并后的实时回归在“Verify Apifox access token”步骤明确失败关闭，未在空凭据下继续执行，也未回退读取 Repository/Organization Secret。

## 双轴代码审查

### Standards

硬违规为 0：`.editorconfig` 的 UTF-8、LF、2 空格、尾空白和末行规则通过，审查范围内提交均使用中文 Conventional Commits。以下为不阻断交付的结构性判断项：

- Duplicated Code：`stableId` 分散在 RSS、OPML 和同步元数据模块；文件存在性与摘要计算也在 ASR、存储模块重复。
- Repeated Switches：转写状态展示仍在动作和标题两处按 `stage` 分派，新增阶段需要同步维护。
- Divergent Change：`PodcastModule` 和 Podcast 页面组件同时承担发现、账户、同步、下载、转写、资料库等多类职责。
- Message Chains：主模块多处直接依赖 `global.lx.worker.dbService.*`，持久化边界仍可收敛。

Vulkan 标签分叉已通过共享穷尽映射修复，标题、详情和设置面板使用同一来源并有回归测试。Standards 轴共 4 个判断项，最主要风险是大型主模块和页面组件的 Divergent Change。

### Spec

- 原审查发现的全量验证证据缺失已由 `245/245` Vitest、五套 TypeScript 和生产构建记录关闭。
- 超过 50 项仍一次创建全部资料库控件的问题已由 50 项渐进窗口关闭。
- RSS 2.0 缺省 `isPermaLink=true` 未处理的问题已修复，并覆盖显式 `false` 与无 GUID 回退测试。
- 本地 ASR、模型下载和说话人分离不在最初的 AurioClub 整改设计 1-6 阶段中，属于范围扩张；它不是当前功能缺失，但扩大了原生依赖、打包和维护面。

Spec 轴剩余 1 个范围项，最主要风险是本地 ASR/说话人能力带来的交付面扩张；没有未实现的原始整改要求。

## 验证证据

### IKUN

- 全量 Vitest：36 个文件，`245/245` 通过；分享工具定向测试 `26/26` 通过。
- TypeScript：common、lang、main、renderer、renderer-lyric 五套配置全部通过。
- `pnpm build:renderer`：Webpack 生产构建通过。
- Electron：常规与 750×800 窄视口无横向溢出、无重叠、控制台 0 error；长逐字稿分页、范围归一、失败恢复、焦点和 reduced-motion 已验证。
- ESLint：仓库没有 ESLint 配置文件，`pnpm lint` 无法作为本轮质量门禁。

### BetterLyrics

- Core：`29/29` 通过。
- WinUI x64 Debug 完整 Rebuild：0 错误、192 个仓库既有警告；包含 `SQLitePCLRaw.lib.e_sqlite3` 的 `NU1903`。
- Windows Application Packaging Project 未在本机验证：Visual Studio 缺少 DesktopBridge targets；这不影响 WinUI 应用项目的成功构建，但属于打包环境前置条件。
- `git diff --check` 通过；现有未提交 C#/XAML 修改均按用户工作树保留，未纳入本轮提交。

### Apifox 与 GitHub

- CLI 资源回读：18 接口、42 Schema、9 环境、18 Mock、22 用例、1 场景、1 套件、1 报告。
- CI 验证器：`14/14` 通过。
- 本地真实隔离回归：22/22 步骤、22/22 实际请求、63/63 断言，全部目标为本机。
- GitHub Environment 和 `main` 分支保护已回读；PR `#1` 的 `Contract verifier unit` 成功并已合并，该检查已设为严格 Required Check。
- 远端实时回归已触发并因 Environment Secret 缺失而失败关闭；失败日志明确停在 Token 预检，未发起 Apifox 请求。

## 本轮阶段提交

IKUN：

- `3af7310 feat: 完善播客文章元数据同步`
- `2cfac7e test: 加固播客长内容契约回归`
- `45616eb feat: 完善播客长逐字稿分页分享`
- `c7cd69b fix: 统一播客转写后端标识`
- `99d3821 fix: 遵循 RSS 默认文章链接语义`
- `e4e6f3d fix: 为播客资料库增加渐进加载`
- `5b837fc docs: 更新 AurioClub 移植终审`

BetterLyrics：

- `d65b1692 feat: 支持播客长逐字稿分页分享`
- `ce07f191 fix: 加固播客长歌词批量分享`
- `cf901ed0 fix: 保持长双语歌词分页配对`
- `6b2892f8 feat: 接入 IKUN 播客逐字稿`

## 最终判定

IKUN 的 AurioClub 客户端移植在本轮范围内完整，带时间轴的播客长逐字稿分页与分享功能完整，UI/UX 设计合理；分享链接遵循“原始文章地址优先、音频地址回退”。BetterLyrics 已完成同类长内容的图片分页分享与 IKUN v2 逐字稿接入，但不返回文章或音频链接。普通博客正文自动转歌词卡片不在当前实现中，应作为新的内容模型需求单独设计。

Apifox 的核心项目资源迁移完整，当前状态为：**核心资源迁移完整，治理整改中**。GitHub 首个 PR 与 Required Check 已闭环；剩余工作是清理两处重复响应、修复或规避摘要计数异常、保护 Apifox 主分支，并由仓库管理员在受保护 Environment 中配置 `APIFOX_ACCESS_TOKEN`。
