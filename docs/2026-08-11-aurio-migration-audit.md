# AurioClub 到 IKUN 播客移植审计报告

- 审计日期：2026-08-11
- Apifox 项目：`8689463`（AurioClub API）
- 审计范围：18 个 released HTTP 接口、42 个 Schema、IKUN 客户端与业务调用、桌面 UI/UX、测试与生产构建、Git 运行文件闭包。

## 结论

本轮整改完成后，可以判定 AurioClub 播客能力已完整移植到 IKUN：

- 接口契约覆盖：`18/18`。方法、路径、请求字段、Bearer、响应信封、原始文本和 `204 No Content` 均有对应实现。
- 业务接线：17 个接口进入实际用户流程；`POST /sync/progress` 有完整客户端封装，但运行时统一走批量接口，属于保留的冗余兼容入口，不构成功能缺口。
- 用户功能：发现、搜索、热门、RSS、订阅分组、OPML、播放、进度、收藏、历史、下载、账户、设备关联、云同步、逐字稿和本地转写均已接通。
- UI/UX：适合桌面音乐播放器的紧凑工作区，信息层级、异步反馈、键盘弹窗、长列表和窄窗口处理合理。
- 可复现性：79 个播客运行与打包必需文件全部进入 Git 索引；此前依赖脏工作树才能运行的问题已消除。
- 质量门禁：31 个测试文件、176 项测试、主进程与渲染器 TypeScript、完整生产构建全部通过。

## 18 接口迁移矩阵

| # | Apifox 接口 | 关键契约 | IKUN 实现与入口 | 结论 |
|---:|---|---|---|---|
| 1 | `GET /auth/me` | Bearer，返回用户 | `me()`；启动恢复会话、登录后复核账号 | 完整 |
| 2 | `PUT /auth/profile` | Bearer，`username` | `updateProfile()`；账户资料表单 | 完整 |
| 3 | `POST /auth/send-code` | `email` | `sendCode()`；验证码登录、注册、重置密码 | 完整 |
| 4 | `POST /auth/login-password` | `email`、`password` | `loginPassword()`；密码登录 | 完整 |
| 5 | `POST /auth/login-email` | `email`、`code` | `loginEmail()`；验证码登录 | 完整 |
| 6 | `POST /auth/register-password` | `email`、`code`、`password` | `registerPassword()`；注册并登录 | 完整 |
| 7 | `POST /auth/reset-password` | `new_password` 等 snake_case 字段 | `resetPassword()`；忘记密码流程 | 完整 |
| 8 | `POST /auth/change-password` | Bearer，`old_password`、`new_password` | `changePassword()`；账户安全表单 | 完整 |
| 9 | `POST /auth/link-device` | Bearer，`device_id`、`migrate_guest_data` | `linkDevice()`；设备关联后立即同步 | 完整 |
| 10 | `GET /sync/pull` | `since`，服务端可返回 401 | `pull()`；带 Bearer，使用水位回退窗口 | 完整；Apifox 漏标鉴权 |
| 11 | `POST /sync/progress` | 单条进度或收藏状态 | `pushProgress()` | 契约完整；运行时由批量接口替代 |
| 12 | `POST /sync/progress/batch` | Bearer，`user_id`、`device_id`、`items` | `pushProgressBatch()`；同步脏状态 | 完整 |
| 13 | `POST /sync/preferences` | Bearer，`subscriptions_json` | `pushPreferences()`；完整分组与订阅快照 | 完整 |
| 14 | `GET /podcasts` | 可选 `limit`、`offset`，响应信封 | `catalog()`；目录发现并合并本地订阅状态 | 完整 |
| 15 | `GET /stats/popular-sources` | `days`、`sort` | `popularSources()`；周期和指标切换 | 完整 |
| 16 | `GET /proxy` | 必填 `url`，成功返回 RSS/HTTP 原文 | `proxyText()`；RSS、章节和发布者逐字稿 | 完整 |
| 17 | `POST /track` | `batch`，成功为 204 空响应 | `track()` 使用 `response: none` | 完整 |
| 18 | `GET /api/itunes-search` | 必填 `term`，原始 iTunes 响应 | `searchItunes()`；边缘服务失败时回退官方 API | 完整 |

## 契约实现质量

核心 API 使用统一响应信封校验，异常保留 `code`、`trace_id` 和 HTTP 状态；iTunes、代理文本和 204 分别走原始 JSON、文本和空响应分支。所有受保护流程从安全存储读取令牌，缺失令牌时直接进入重新登录状态；网络请求具备超时、重定向处理和错误归一化。

请求字段与 Apifox Schema 一致，重点包括 `new_password`、`old_password`、`device_id`、`migrate_guest_data`、`podcast_id`、`client_updated_at` 和 `subscriptions_json`。代理与下载入口在客户端侧拒绝带凭据、本机和私网 URL，降低 SSRF 风险。

同步以 episode state 为单一事实来源：播放、完成和收藏状态批量上行；服务端状态按更新时间合并；订阅偏好使用包含 `groups` 与 `sources` 的完整快照，并兼容旧 ID 数组。

## 功能完整度

- 发现：服务端目录、热门排行、iTunes 搜索与官方回退已接通。
- 订阅：订阅/取消、自动下载选项、分组增删改排、节目移动、OPML 导入导出已接通。
- 资料库：收藏和播放历史来自持久化 episode state，登录与未登录均可使用。
- 播放：播客队列、倍速、系统媒体信息、进度回写、结束状态和跨重启恢复已接通；播客禁用音乐交叉淡化。
- 离线：断点下载、`.part` 隔离、磁盘完成态恢复和存储迁移校验已接通。
- 逐字稿：发布者字幕、本地 ASR、分段进度、取消/继续、说话人分离与 AI 标注已接通；Open API 仅允许回环读取当前内容。
- 账户：密码/验证码登录、注册、重置/修改密码、用户名、退出和设备关联已接通。
- 同步：进度、完成、收藏、订阅分组、错误状态、重新鉴权和手动重试已接通。

## UI/UX 审计

原站公开登录页是低密度黑白单列表单；IKUN 播客页位于既有桌面播放器内，采用主题化、内容优先、紧凑工作区比照搬原站布局更符合使用场景。导航、发现、资料库和设置保持同一视觉语言，没有引入独立的营销式页面或嵌套卡片体系。

通过项：

- 订阅弹窗具备 `dialog` 语义、标题关联、打开聚焦、Tab 环绕、Escape 关闭和触发按钮焦点恢复。
- 订阅、取消、收藏、下载和账户操作均有局部忙碌状态、防重复提交、成功或就地错误反馈。
- 单集每批加载 50 项，避免一次创建数百个操作控件；后续批次按需加载状态。
- 720 px 和 375 px CSS 视口测试无横向滚动；窄视口下节目头部和单集操作会换行。
- 原生窗口请求缩至 `500x300` 后，被限制在约 `828x540` 逻辑像素；测试机 DPR 约 1.2，对应 `994x648` 物理像素。
- 标准桌面视口无内容溢出，页面控制台未发现应用脚本错误。

## Apifox 与剩余风险

以下问题不阻塞 IKUN 功能，但应作为后续治理项：

1. Apifox 项目详情显示 `endpointCount: 0`，接口列表实际为 18；项目统计元数据不一致。
2. `/sync/pull` 会返回 401，却未在接口详情声明 Bearer；IKUN 已按真实服务行为发送鉴权。
3. `/podcasts` 与 `/stats/popular-sources` 各存在重复的 200 错误响应定义，应改为真实错误状态码。
4. Apifox 项目详情显示测试场景、单接口用例和测试套件均为 0，服务端契约缺少独立自动化门禁。
5. 一张第三方 CloudFront 节目封面持续返回 403；不影响数据和播放，但应增加图片代理、缓存或明确的封面占位。
6. 当前是桌面键鼠优先界面；若未来正式支持触屏，应把紧凑次级按钮的命中区统一扩至至少 44 px。
7. 客户端响应类型仍以 `unknown` 加运行时归一化为主；已由测试保护，但未来 Schema 漂移不能完全依赖编译期发现。

## 验证证据

- `apifox --version`：2.2.9。
- Apifox：18 个 released 接口、42 个 Schema，逐接口读取方法、路径、参数、鉴权和响应。
- 18 接口契约测试：全部路径、HTTP 方法、关键请求体、鉴权模式及 204 处理通过。
- `pnpm test:run`：31 个文件、176 项测试全部通过。
- `tsc --noEmit -p src/main/tsconfig.json`：通过。
- `tsc --noEmit -p src/renderer/tsconfig.json`：通过。
- `pnpm build`：主进程、主渲染器、桌面歌词和渲染脚本全部通过。
- Git 索引闭包：79 个必需文件，缺失 0，临时文件混入 0。
- Electron 实机：数据库初始化成功、节目载入、首批 50 集、弹窗键盘流、窄窗口布局和原生最小尺寸均通过。

最终判定：移植完整，UI/UX 在 IKUN 桌面产品中设计合理；剩余项属于文档治理、第三方资源容错与未来触屏增强，不阻塞交付。
