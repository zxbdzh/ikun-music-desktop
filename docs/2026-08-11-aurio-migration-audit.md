# AurioClub 到 IKUN 播客移植审计报告

- 审计日期：2026-08-11
- Apifox 项目：`8689463`（AurioClub API）
- 审计范围：18 个 released HTTP 接口、42 个 Schema、8 个环境、IKUN 客户端与业务调用、AurioClub 登录态原站、IKUN/BetterLyrics 长逐字稿分享、桌面 UI/UX、测试与生产构建、Git 运行文件闭包。

## 结论

本轮整改完成后，可以判定 AurioClub 播客能力已完整移植到 IKUN：

- 接口契约覆盖：`18/18`。方法、路径、请求字段、Bearer、响应信封、原始文本和 `204 No Content` 均有对应实现。
- 业务接线：17 个接口进入实际用户流程；`POST /sync/progress` 有完整客户端封装，但运行时统一走批量接口，属于保留的冗余兼容入口，不构成功能缺口。
- 用户功能：发现、搜索、热门、RSS、订阅分组、OPML、播放、进度、收藏、历史、下载、账户、设备关联、云同步、逐字稿和本地转写均已接通。
- 长内容分享：IKUN 与 BetterLyrics 均按每页最多 6 行、240 个展示字符分页；真实播客逐字稿在 IKUN 中生成 254 页，避免把整篇逐字稿塞入单张分享卡片。
- 分享链接：IKUN 优先分享原始节目文章地址，缺失时回退原始音频地址；输出前统一解码 HTML 实体并仅接受 HTTP(S) URL。
- UI/UX：适合桌面音乐播放器的紧凑工作区，信息层级、异步反馈、键盘弹窗、长列表、分页和最小窗口处理合理。
- 可复现性：79 个播客运行与打包必需文件全部进入 Git 索引；此前依赖脏工作树才能运行的问题已消除。
- 质量门禁：32 个测试文件、192 项测试、主进程与渲染器 TypeScript、完整生产构建全部通过。

需要区分两个结论：IKUN 的客户端迁移与运行链路完整；Apifox 项目本身仍缺测试场景、单接口用例、测试套件和 Mock 期望，因此还不能视为具备独立的服务端质量门禁。

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

## 原站登录态对照

使用用户授权的临时登录态对 `https://app.aurioclub.com/` 做了只读实测，未把凭证写入仓库、日志或报告。`/auth/me` 与 `/sync/pull` 均返回 200，页面控制台没有应用脚本错误；浏览和播放过程中能够观察到正常的播放进度同步请求。

原站登录后可见的时间线、发现、排行榜、搜索/RSS、最近播放、收藏、订阅管理、分组、导入导出、账户、主题、语言和云同步，在 IKUN 均有对应入口或等价流程。IKUN 没有机械复制原站的网页布局，而是将这些能力纳入既有桌面播放器的信息架构；功能映射完整，交互形态符合桌面使用场景。

## 长逐字稿与分享链路

- BetterLyrics：分享页对所选歌词按最多 6 行、240 个展示字符分页；超长单行独占一页；上一页、下一页和页码状态已接入；保存多页时文件名追加 `_pX-of-Y`。分页器有 5 项定向测试。
- IKUN：播客分享默认选择完整逐字稿，使用相同的 6 行/240 字符规则生成页面；分享弹窗可前后翻页，复制或保存只处理当前页，多页文件名追加 `_pX-of-Y`。真实节目验收结果为 254 页，页 1 与页 2 内容确实变化。
- 链接语义：RSS 解析和数据库持久化保留原始节目文章 URL；复制链接和二维码优先使用该 URL，仅在缺失或无效时回退 enclosure 音频 URL。
- 历史兼容：分享前统一解码 `&amp;` 等 HTML 实体并校验 HTTP(S)，因此旧数据库中的查询参数不会以错误实体形式复制或编码进二维码。
- 回归保护：IKUN 分享工具测试 11/11 通过；分享、RSS 与数据库迁移组合测试 19/19 通过。

## 功能完整度

- 发现：服务端目录、热门排行、iTunes 搜索与官方回退已接通。
- 订阅：订阅/取消、自动下载选项、分组增删改排、节目移动、OPML 导入导出已接通。
- 资料库：收藏和播放历史来自持久化 episode state，登录与未登录均可使用。
- 播放：播客队列、倍速、系统媒体信息、进度回写、结束状态和跨重启恢复已接通；播客禁用音乐交叉淡化。
- 离线：断点下载、`.part` 隔离、磁盘完成态恢复和存储迁移校验已接通。
- 逐字稿：发布者字幕、本地 ASR、分段进度、取消/继续、说话人分离与 AI 标注已接通；Open API 仅允许回环读取当前内容。
- 分享：普通歌曲沿用按需选词；播客默认选择完整逐字稿并自动分页；复制链接、复制图片、保存图片与二维码均使用统一的原始链接解析结果。
- 账户：密码/验证码登录、注册、重置/修改密码、用户名、退出和设备关联已接通。
- 同步：进度、完成、收藏、订阅分组、错误状态、重新鉴权和手动重试已接通。

## UI/UX 审计

原站是内容优先的网页工作区；IKUN 播客页位于既有桌面播放器内，采用主题化、紧凑工作区比照搬原站布局更符合使用场景。导航、发现、资料库和设置保持同一视觉语言，没有引入独立的营销式页面或嵌套卡片体系。

通过项：

- 订阅弹窗具备 `dialog` 语义、标题关联、打开聚焦、Tab 环绕、Escape 关闭和触发按钮焦点恢复。
- 分享弹窗同样具备 `dialog` 语义、动态 ARIA 描述、Tab/Shift+Tab 焦点闭环、Escape 关闭和关闭后焦点恢复；封面与二维码有替代文本。
- 分页栏固定在卡片下方，不随卡片内容滚动；前后按钮为稳定的 `44x44` 命中区，首尾页使用原生禁用语义，页码变化不会引发布局跳动。
- 分享卡片使用独立纵向滚动区，遮罩能够隔离背景，长逐字稿不会撑高弹窗或遮挡底部操作。
- 订阅、取消、收藏、下载和账户操作均有局部忙碌状态、防重复提交、成功或就地错误反馈。
- 单集每批加载 50 项，避免一次创建数百个操作控件；后续批次按需加载状态。
- 720 px 和 375 px CSS 视口测试无横向滚动；窄视口下节目头部和单集操作会换行。
- 原生窗口请求缩至 `500x300` 后，被限制在约 `828x540` 逻辑像素；测试机 DPR 约 1.2，对应 `994x648` 物理像素。
- 在 `828x540` 最小逻辑视口中，分享弹窗为约 `812x524`，无横向溢出；第 2/254 页的两个分页按钮仍保持 `44x44` 且位置稳定，选择区和卡片区可独立纵向滚动。
- 标准桌面视口无内容溢出，页面控制台未发现应用脚本错误。

## Apifox 与剩余风险

以下问题不阻塞 IKUN 功能，但应作为后续治理项：

1. Apifox 项目详情显示 `endpointCount: 0`，接口列表实际为 18；项目统计元数据不一致。
2. `/sync/pull` 会返回 401，却未在接口详情声明 Bearer；IKUN 已按真实服务行为发送鉴权。
3. `/podcasts` 与 `/stats/popular-sources` 各存在重复的 200 错误响应定义，应改为真实错误状态码。
4. Apifox 共配置 8 个环境，但测试场景、单接口用例、测试套件和 Mock 期望均为 0，服务端契约缺少独立自动化与 Mock 门禁。
5. 一张第三方 CloudFront 节目封面持续返回 403；不影响数据和播放，但应增加图片代理、缓存或明确的封面占位。
6. 分享分页控件已达到 44 px；应用其他紧凑次级按钮尚未做全量触屏命中区审计，正式支持触屏前仍需统一复核。
7. 客户端响应类型仍以 `unknown` 加运行时归一化为主；已由测试保护，但未来 Schema 漂移不能完全依赖编译期发现。

## 验证证据

- `apifox --version`：2.2.9。
- Apifox：18 个 released 接口、42 个 Schema、8 个环境、0 个场景用例、0 个单接口用例、0 个测试套件、0 个 Mock 期望；逐接口读取方法、路径、参数、鉴权和响应。
- 原站登录态：`/auth/me`、`/sync/pull` 返回 200；核心页面与 IKUN 功能逐项对照；控制台无应用脚本错误。
- 18 接口契约测试：全部路径、HTTP 方法、关键请求体、鉴权模式及 204 处理通过。
- `pnpm test:run`：32 个文件、192 项测试全部通过。
- `tsc --noEmit -p src/main/tsconfig.json`：通过。
- `tsc --noEmit -p src/renderer/tsconfig.json`：通过。
- `pnpm build`：主进程、主渲染器、桌面歌词和渲染脚本全部通过。
- BetterLyrics 分享分页测试：5/5 通过。
- Git 索引闭包：79 个必需文件，缺失 0，临时文件混入 0。
- Electron 实机：数据库初始化成功、节目载入、首批 50 集、254 页长逐字稿、页间内容变化、弹窗键盘流、焦点恢复、窄窗口布局和 `828x540` 原生最小尺寸均通过。

最终判定：移植完整，UI/UX 在 IKUN 桌面产品中设计合理；剩余项属于文档治理、第三方资源容错与未来触屏增强，不阻塞交付。
