# AurioClub 到 IKUN 播客移植与分享审计报告

- 更新日期：2026-08-12
- Apifox 项目：`8689463`（AurioClub API）
- 审计对象：AurioClub 原站、IKUN Music Desktop、BetterLyrics、Apifox 项目资源
- 审计范围：18 个 HTTP 接口、42 个 Schema、9 个环境、客户端业务链路、播客长逐字稿分享、桌面 UI/UX、自动化测试与构建

## 总评

本轮应采用以下结论：

> IKUN 客户端迁移与运行链路完整，BetterLyrics 长歌词分享已完成增强；Apifox 已修复 `/sync/pull` 鉴权及 `/proxy` 媒体类型契约，并建立 18/18 默认成功 Mock、22 条单接口回归、1 个全接口场景、1 个非空套件和 1 份通过的云报告；仓库隔离回归门禁已通过本地验证，但两个重复响应、项目摘要计数、受保护 CI Secret 与分支保护尚未闭环，因此整体状态仍是“客户端交付完整，Apifox 治理进行中”。

| 对象 | 判定 | 依据 |
|---|---|---|
| IKUN 客户端 | 完整 | 18 个接口均有实现映射，17 个进入实际用户流程，单条进度接口作为批量同步的兼容入口保留；播客、账户、同步、逐字稿、下载与分享链路均已接通 |
| IKUN 长内容分享 | 功能完整，UI 有债务 | 逐字稿选择列表 `40 条/页`，分享卡片 `5 行/120 个展示字符/页`；支持直接跳页、当前页复制/保存、全部页批量保存、取消与失败恢复；入口命中区与 reduced-motion 待修 |
| BetterLyrics 长内容分享 | 已增强 | 固定高度样式使用专属容量，其他样式自适应；支持当前页、全部页、页码范围导出，以及快照、进度、取消和失败页重试 |
| Apifox 项目 | 整改中 | 18 个接口均有默认成功 Mock，22 条单接口回归、1 个全接口场景、1 个非空套件及 1 份云报告均已验证；Apifox Runner/定时任务仍为 0，GitHub 远端门禁待绑定受保护 Environment、配置 Secret 与分支保护，且两处重复响应和摘要计数问题尚未闭环 |

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
| 10 | `GET /sync/pull` | `pull()`；实际请求携带 Bearer，并使用水位回退窗口 | 完整；Apifox Bearer 已补齐 |
| 11 | `POST /sync/progress` | `pushProgress()` | 契约完整；运行时由批量接口替代 |
| 12 | `POST /sync/progress/batch` | `pushProgressBatch()`；批量同步脏状态 | 完整 |
| 13 | `POST /sync/preferences` | `pushPreferences()`；同步分组与订阅快照 | 完整 |
| 14 | `GET /podcasts` | `catalog()`；发现目录并合并本地订阅状态 | 完整 |
| 15 | `GET /stats/popular-sources` | `popularSources()`；周期和指标切换 | 完整 |
| 16 | `GET /proxy` | `proxyText()`；RSS、章节和发布者逐字稿 | 完整 |
| 17 | `POST /track` | `track()`；按 `204 No Content` 处理 | 完整 |
| 18 | `GET /api/itunes-search` | `searchItunes()`；失败时回退官方 API | 完整 |

接口实现统一处理响应信封、HTTP 状态、`code`、`trace_id`、超时和错误归一化；iTunes、代理文本与 204 分别走原始 JSON、文本和空响应分支。请求字段与 Schema 中的 snake_case 契约一致。代理和下载入口在客户端拒绝带凭据、本机及私网 URL。

## 原站与业务功能对照

使用用户授权的临时登录态对 `https://app.aurioclub.com/` 做了只读核对。凭证未写入仓库、报告或日志；`/auth/me` 与 `/sync/pull` 返回 200，页面未观察到应用脚本错误。

原站的时间线、发现、排行榜、搜索/RSS、最近播放、收藏、订阅与分组、导入导出、账户、主题、语言和云同步，在 IKUN 中均有对应入口或等价桌面流程。IKUN 没有复制网页布局，而是将能力放入现有播放器导航、资料库、播放队列和设置体系中。

## 长逐字稿与分享

### IKUN

- 播客默认选择完整逐字稿；选择列表每页显示 40 条，支持方向键、PageUp/PageDown、Home/End、空格和 Enter 操作。
- 分享卡片按最多 5 行、120 个展示字符分页；超长正文和翻译按 Unicode 字素簇拆分，不破坏 Emoji、组合字符或无空格 URL。
- 卡片支持上一页、下一页和页码直接跳转；分页控件尺寸稳定，不因位数变化挤压布局。
- 当前页可复制图片、保存图片；全部页面可选择目录后批量保存。重复点击只打开一次目录选择。
- 批量导出冻结分页、节目元数据、封面、二维码、分享 URL、样式和翻译开关，避免切歌或异步刷新产生混合卡片。
- 取消在页面边界生效：当前正在渲染或写入的页面可能完成，之后停止；已完成文件保留，不回滚。
- 失败信息指出失败页和恢复方式；关闭弹窗会请求取消，并在当前页完成后关闭。
- 最新 Electron 实机加载 V88 的 1,520 条真实逐字稿：选择列表按 40 条/页得到 38 页，分享卡片按 5 行/120 个展示字符得到 314 页。
- 页码跳转会把 `999` 归一到第 314 页、把 `0` 归一到第 1 页；末页“下一页”使用原生禁用语义。PageDown/PageUp、空格选择、焦点首尾循环、Escape 关闭及焦点回收均通过。
- 首屏预览 `scrollHeight == clientHeight == 357`，无横向溢出；该节目缺少文章地址时，实机卡片显示“扫码打开音频”，确认分享链接正确回退到 enclosure 音频地址。
- 早期 90 行样本的目录取消、重复点击、批量取消、关闭、第二页写入失败及 A→B→A 异步竞态回归仍全部通过。

### BetterLyrics

- `AncientBook`：2 行、每行 15 个展示字符、每页 30 个字符。
- `BambooSlips`：4 行、每行 15 个展示字符、每页 60 个字符。
- 其他 23 个样式高度随内容自适应，分页上限为 6 行、每行 240 个展示字符、每页 240 个字符。
- 超长原文和译文按字素簇无损拆分；不插入人工省略号，不生成空白页。
- 切换样式会重新分页，并按当前页起始字符锚点定位到同一段正文，而不是机械保留旧页码。
- 页码位于卡片外的固定页脚，不覆盖歌词；NumberBox 支持直接跳页。
- 保存支持当前页、全部页和页码范围；导出冻结分页、标题、作者、封面、强调色、样式与字体。
- 单页保存使用事务写入；批量保存先写临时文件再改名。支持实时进度、取消、仅重试失败页、页面卸载取消和焦点恢复。
- 元数据刷新带 generation，旧歌曲请求不能覆盖新歌曲；导出结束后再应用期间积累的歌词或元数据变化。

BetterLyrics 分享模板当前只显示原文与译文，不显示 `TertiaryText` 音译层。这是既有模板能力边界，不影响本轮播客正文分享，但应在后续需要三层歌词时单独设计。

## 分享链接语义

IKUN 的 RSS 解析、数据库迁移和读写链路保留节目原始文章地址：

1. 优先使用 RSS `<link>`、Atom alternate link 或有效 permalink GUID。
2. 分享前解码 HTML 实体，并通过 `URL` 校验仅接受 HTTP(S)。
3. 拒绝带内嵌凭据的链接。
4. 文章地址缺失或无效时回退 enclosure 音频地址。
5. 回退音频时卡片明确显示“扫码打开音频”，不会误导为文章详情页。

复制链接与二维码使用同一解析结果。若文章和音频地址均无效，则不生成伪造地址。

## UI/UX 审计

按 `ui-ux-pro-max` 的可访问性、交互反馈、长内容布局、焦点管理和错误恢复规则复核后，IKUN 与 BetterLyrics 的核心分享流程设计合理，但 IKUN 仍有两个明确的 UI 可访问性债务，不能表述为全量验收完成：

- 页面保持桌面音乐工具的紧凑信息密度，没有新增营销式页面或嵌套卡片结构。
- 分页采用熟悉的前后图标和页码输入；首尾页使用原生禁用语义，图标按钮带名称或工具提示。
- 分享弹窗内的分页、取消和关闭按钮约 44px；动态内容使用稳定尺寸，页码和进度不会推动周围布局。
- 长文本被拆成可扫描页面；页码位于独立页脚，正文不会被页码遮挡。
- 异步导出禁用冲突操作，显示实时状态和取消入口；错误包含下一步，而非只显示“失败”。
- IKUN 的实时进度位于 busy 子树之外，完成后 `aria-busy=false`；BetterLyrics 使用 polite live 状态并在完成后恢复焦点。
- 快照和 generation 共同解决切歌、封面、标题、二维码与歌词的异步混合问题。
- IKUN 弹窗初始焦点落在关闭按钮，Tab/Shift+Tab 焦点循环、Escape 退出及关闭后的焦点回收符合模态交互预期。

残余问题：PlayDetail 的分享入口实际命中区约 `20×19px`，低于推荐的 `44×44px`；分享弹窗的页面切换动画尚未显式响应 `prefers-reduced-motion`。这两项不阻断鼠标与键盘下的核心分享流程，但应在发布前作为高优先级 UI 修复项处理。

结论边界：本轮不是完整 WCAG、明暗主题、动态文本或全应用触屏认证。IKUN 最新实机重点覆盖了分享流程，而非全应用所有窗口尺寸，且第 314 页预览区未重复采集精确 `scrollHeight/clientHeight`；BetterLyrics 尚无自动化 UI 像素测试，建议在实际 WinUI 环境分别导出古籍、竹简的中文长段、Emoji 和双语内容确认字体度量。

## Apifox 完整度与缺口

Apifox CLI 2.2.9 的最新回读结果：

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

整改状态：

1. 项目摘要为 `endpointCount=0`，但接口列表实际有 18 个接口。
2. `/sync/pull` 的 Bearer 声明已补齐，使用与其他受保护接口一致的 `{{JWT_TOKEN}}` 变量；回读确认 2 个查询参数和 3 个响应均完整保留。
3. `/podcasts` 存在错误重复的 200 响应 `165266986`。
4. `/stats/popular-sources` 存在错误重复的 200 响应 `166940786`。
5. 项目设置为 `allowAutomationWriteMainBranch=true`，`main` 未保护，且本阶段直接更新已成功；分支详情仍返回 `isAiWritableBranch=false`，该字段不能作为当前写权限的唯一判据。
6. 单接口运行发现 `/proxy` 的 200 实际返回 XML，与原主响应 JSON 声明不一致；现已修正为 XML 字符串，并完整保留 7 种附加媒体类型。400 与 502 的 `ProxyError` Schema 经生产响应复核后保持不变。
7. 项目没有 Runner；Apifox 云端定时任务不能启动本仓库 Mock 或访问 `127.0.0.1`，因此未创建不可运行的占位任务。仓库已改用 GitHub Actions 在作业内启动 Mock，首次远端运行前仍需让实时回归 job 绑定受保护 Environment，并把 `APIFOX_ACCESS_TOKEN` 仅配置为该 Environment 的 Secret。

鉴权阶段已按 `cli-schema get -> validate -> update -> get` 闭环修复 `/sync/pull`，未写入真实 Bearer，也未删除任何响应。Apifox 仍不能判定为“迁移完成”或“质量门禁就绪”；删除两个重复响应属于破坏性操作，执行前仍需单独确认。

Mock 阶段已按 `cli-schema get -> validate -> create -> get/list` 闭环完成：18 份创建 payload 全部通过 `mock-create` 校验，远端 18 个 Mock 恰好覆盖 18 个接口，缺失、越界和重复覆盖均为 0。`/proxy` 的固定 RSS 样例同时包含原始文章链接和音频 enclosure，可用于博客长内容分享及音频回退验证；所有文件仅含 mock 占位数据。

`/proxy` 契约修复同样完成 `get -> validate -> update -> get` 闭环：1 个查询参数和 3 个响应均保留，200 主响应为 XML 字符串，400 与 502 继续引用既有 `ProxyError` Schema。

单接口回归阶段建立了 22 条用例和专用“AurioClub CLI 隔离 Mock”环境：18 条覆盖全部 HTTP 接口的成功路径，4 条覆盖无 Bearer、缺少代理 URL 和 iTunes 429。隔离服务器仅监听 `127.0.0.1:48765`，三类服务地址均已回读；22 份本地 JSON 报告显示 22/22 步骤、22/22 请求和 60/60 断言通过，0 失败、0 运行时错误，所有请求目标均为本机。临时报告含 CLI 凭据快照，已在汇总后删除且不纳入版本库。

场景阶段创建“AurioClub 全接口契约回归”，并通过 18 组 `import-steps --source test-case --sync manual` 导入 22 条用例快照。`get --with-case-detail` 回读确认 22 个启用的 HTTP 步骤、编号 1–22 唯一连续、覆盖 18 个接口且保留 60 个断言；隔离运行再次得到 22/22 步骤、22/22 请求和 60/60 断言通过，0 失败、0 运行时错误、0 个非本机请求。

套件阶段创建“AurioClub 隔离契约回归套件”，回读确认 `items` 非空并静态引用全接口场景。套件隔离运行的本地 JSON 报告为 22/22 步骤、22/22 请求、60/60 断言通过，随后成功上传云报告 `25268012`；云端回读状态为 `done`，环境为“AurioClub CLI 隔离 Mock”，22/22 步骤通过。

仓库新增 `npm run test:apifox` 编排器与 GitHub Actions 门禁：脚本自动启动/停止 Mock，并联合校验 Apifox JSON、JUnit XML 与 Mock JSONL 三类独立证据，严格确认 22 次实际请求、60 条断言、固定统计和全部本机目标；运行后会删除敏感临时报告。验证器单测 `12/12` 通过，本地真实隔离回归为 22/22 请求、60/60 断言通过。

PR 工作流不读取 Secret，也没有 workflow-level `paths` 过滤，因此可作为稳定的 `Contract verifier unit` Required Check；带凭据的实时工作流只在 `main` push、每日定时和手动触发时运行。当前仓库尚未配置 `APIFOX_ACCESS_TOKEN`，实时回归 job 也未声明 `environment:`，远端实时门禁并未激活。

上线前必须完成以下外部配置：实时回归 job 绑定专用 Environment；该 Environment 仅允许受保护的 `main` 部署，并独占 `APIFOX_ACCESS_TOKEN` Secret，不保留同名 Repository/Organization Secret；`main` 启用 Require pull request，并把 `Contract verifier unit` 设为必需检查。`workflow_dispatch` 可选择任意 ref，Environment 的分支限制必须确保非 `main` ref 无法取得 Token。若仓库 write 用户也不受信任，再启用 required reviewer 与 prevent self-review；代价是每日定时任务同样会等待人工批准，不能再视为无人值守运行。

## 验证证据

IKUN：

- Vitest：分享、RSS、数据库迁移 3 个文件，共 `29/29` 通过。
- Renderer TypeScript：`tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `en-us.json`、`zh-cn.json`、`zh-tw.json`：JSON 解析通过。
- `pnpm build:renderer`：Webpack 生产构建通过。
- V88 实机：1,520 条逐字稿、38 页选择列表、314 张分享卡片；跳页边界、键盘操作、焦点循环、首屏无溢出和音频链接回退均通过。
- UI 审计另启 Electron 进程 PID `56120`；既有 PID `64404` 为数据库调试工具，回归未终止或干扰该进程。
- 实机截图：`C:\Users\1\AppData\Local\Temp\ikun-share-dialog.png`（临时审计证据，未纳入版本库）。

BetterLyrics：

- Core 测试项目：`22/22` 通过。
- WinUI x64 Debug：构建 0 错误、177 个仓库既有警告，其中包括 `SQLitePCLRaw.lib.e_sqlite3` 的 `NU1903`。
- XAML/三语 RESW XML、重复键、三语占位符、`git diff --check`：通过。

Apifox：

- 18/18 HTTP 接口均有默认成功 Mock，唯一接口覆盖无缺失、无越界、无重复。
- 隔离单接口回归：22/22 步骤、22/22 请求、60/60 断言通过；0 失败、0 运行时错误、0 个非本机请求。
- 全接口契约场景：22 个启用步骤覆盖 18 个接口；隔离运行 22/22 步骤与 60/60 断言通过。
- 非空套件与云报告：套件 1 项，云报告 `25268012` 状态 `done`，22/22 步骤通过。
- CI 验证器：单测 `12/12` 通过；JSON、JUnit、Mock JSONL 三重证据确认 22/22 实际请求、60/60 断言，且 Windows 本地端到端自测后报告目录、Mock 端口和系统临时目录均无残留。

阶段提交：

- IKUN `d94725b feat: 支持播客原始链接分享`
- IKUN `ff37021 feat: 支持播客长逐字稿分页分享`
- IKUN `7d8d8fc fix: 加固播客长文本分页与分享链接`
- IKUN `c546e71 feat: 完善播客多页分享体验`
- IKUN `b150708 test: 建立 AurioClub 接口回归用例`
- IKUN `faae4a0 test: 建立 AurioClub 全接口回归场景`
- IKUN `833f0ae ci: 建立 AurioClub 契约回归门禁`
- IKUN `11dde6f fix: 加固 AurioClub CI 隔离校验`
- BetterLyrics `d65b1692 feat: 支持播客长逐字稿分页分享`
- BetterLyrics `ce07f191 fix: 加固播客长歌词批量分享`

## 最终判定

IKUN 已完成 AurioClub 18 个 HTTP 接口的客户端功能映射和运行链路接入，播客长逐字稿分页、批量分享以及原始文章/音频回退在本轮验证范围内工作正常；分享弹窗在键盘可达性、焦点管理、异步反馈、错误恢复和长内容布局方面设计合理。BetterLyrics 已完成按样式容量分页及当前页/全部页/范围导出。IKUN 的 PlayDetail 分享入口命中区和弹窗 reduced-motion 适配仍需修复，因此 UI/UX 结论是“核心流程合理，发布级可访问性尚有两项明确债务”。

Apifox 项目已完成 `/sync/pull` 鉴权、`/proxy` 媒体类型契约、18/18 默认成功 Mock、22 条隔离单接口回归、1 个全接口契约场景、1 个非空套件及 1 份通过的云报告；仓库 CI/定时门禁代码也已完成三重证据和 12/12 验证器单测。剩余缺口是两个重复响应、项目摘要计数、Apifox Runner/原生定时任务，以及实时工作流的 Environment 绑定、GitHub `APIFOX_ACCESS_TOKEN` Environment Secret、分支保护与 Required Check 尚未配置。当前总评为：**客户端交付完整，Apifox 治理进行中**。
