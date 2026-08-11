# AurioClub 到 IKUN 播客移植与分享审计报告

- 更新日期：2026-08-12
- Apifox 项目：`8689463`（AurioClub API）
- 审计对象：AurioClub 原站、IKUN Music Desktop、BetterLyrics、Apifox 项目资源
- 审计范围：18 个 HTTP 接口、42 个 Schema、8 个环境、客户端业务链路、播客长逐字稿分享、桌面 UI/UX、自动化测试与构建

## 总评

本轮应采用以下结论：

> IKUN 客户端迁移与运行链路完整，BetterLyrics 长歌词分享已完成增强；Apifox 已修复 `/sync/pull` 鉴权及 `/proxy` 媒体类型契约，并建立 18/18 默认成功 Mock，但重复响应和自动化测试门禁仍未闭环，因此整体状态仍是“客户端交付完整，Apifox 治理进行中”。

| 对象 | 判定 | 依据 |
|---|---|---|
| IKUN 客户端 | 完整 | 18 个接口均有实现映射，17 个进入实际用户流程，单条进度接口作为批量同步的兼容入口保留；播客、账户、同步、逐字稿、下载与分享链路均已接通 |
| IKUN 长内容分享 | 完整 | 逐字稿选择列表 `40 条/页`，分享卡片 `5 行/120 个展示字符/页`；支持直接跳页、当前页复制/保存、全部页批量保存、取消与失败恢复 |
| BetterLyrics 长内容分享 | 已增强 | 固定高度样式使用专属容量，其他样式自适应；支持当前页、全部页、页码范围导出，以及快照、进度、取消和失败页重试 |
| Apifox 项目 | 整改中 | 接口和 Schema 已录入，`/sync/pull` Bearer 与 `/proxy` 响应契约已修复，18 个接口均有默认成功 Mock；测试用例、场景、套件、报告、Runner、定时任务仍为 0，且两处重复响应和摘要计数问题尚未闭环 |

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
- 最新 Electron 实机使用 90 行逐字稿生成 18 张卡片、3 页选择列表；目录取消、重复点击、取消、关闭、第二页写入失败及 A→B→A 异步竞态均通过。

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

按 `ui-ux-pro-max` 的可访问性、交互反馈、长内容布局、焦点管理和错误恢复规则复核后，IKUN 与 BetterLyrics 的本轮分享交互设计合理：

- 页面保持桌面音乐工具的紧凑信息密度，没有新增营销式页面或嵌套卡片结构。
- 分页采用熟悉的前后图标和页码输入；首尾页使用原生禁用语义，图标按钮带名称或工具提示。
- 关键分页与取消控件达到 44px 高度；动态内容使用稳定尺寸，页码和进度不会推动周围布局。
- 长文本被拆成可扫描页面；页码位于独立页脚，正文不会被页码遮挡。
- 异步导出禁用冲突操作，显示实时状态和取消入口；错误包含下一步，而非只显示“失败”。
- IKUN 的实时进度位于 busy 子树之外，完成后 `aria-busy=false`；BetterLyrics 使用 polite live 状态并在完成后恢复焦点。
- 快照和 generation 共同解决切歌、封面、标题、二维码与歌词的异步混合问题。

结论边界：本轮不是完整 WCAG、明暗主题、动态文本或全应用触屏认证。IKUN 最新实机重点覆盖了分享流程，而非全应用所有窗口尺寸；BetterLyrics 尚无自动化 UI 像素测试，建议在实际 WinUI 环境分别导出古籍、竹简的中文长段、Emoji 和双语内容确认字体度量。

## Apifox 完整度与缺口

Apifox CLI 2.2.9 的整改阶段 1 回读结果：

| 资源 | 数量 |
|---|---:|
| HTTP 接口 | 18 |
| Schema | 42 |
| 环境 | 8 |
| Mock | 18 |
| 单接口测试用例 | 0 |
| 测试场景 | 0 |
| 测试套件 | 0 |
| 测试报告 | 0 |
| Runner | 0 |
| 定时任务 | 0 |

整改状态：

1. 项目摘要为 `endpointCount=0`，但接口列表实际有 18 个接口。
2. `/sync/pull` 的 Bearer 声明已补齐，使用与其他受保护接口一致的 `{{JWT_TOKEN}}` 变量；回读确认 2 个查询参数和 3 个响应均完整保留。
3. `/podcasts` 存在错误重复的 200 响应 `165266986`。
4. `/stats/popular-sources` 存在错误重复的 200 响应 `166940786`。
5. 项目设置为 `allowAutomationWriteMainBranch=true`，`main` 未保护，且本阶段直接更新已成功；分支详情仍返回 `isAiWritableBranch=false`，该字段不能作为当前写权限的唯一判据。
6. 单接口运行发现 `/proxy` 的 200 实际返回 XML、400 实际返回空体，与原 JSON/ApiError 声明不一致；现已修正为 XML 字符串与空响应体，并完整保留 7 种附加媒体类型和 502 错误 Schema。

本阶段已按 `cli-schema get -> validate -> update -> get` 闭环修复 `/sync/pull`，未写入真实 Bearer，也未删除任何响应。Apifox 仍不能判定为“迁移完成”或“质量门禁就绪”；删除两个重复响应属于破坏性操作，执行前仍需单独确认。

Mock 阶段已按 `cli-schema get -> validate -> create -> get/list` 闭环完成：18 份创建 payload 全部通过 `mock-create` 校验，远端 18 个 Mock 恰好覆盖 18 个接口，缺失、越界和重复覆盖均为 0。`/proxy` 的固定 RSS 样例同时包含原始文章链接和音频 enclosure，可用于博客长内容分享及音频回退验证；所有文件仅含 mock 占位数据。

`/proxy` 契约修复同样完成 `get -> validate -> update -> get` 闭环：1 个查询参数和 3 个响应均保留，200 主响应为 XML 字符串，400 为空体，502 继续引用既有错误 Schema。

## 验证证据

IKUN：

- Vitest：分享、RSS、数据库迁移 3 个文件，共 `29/29` 通过。
- Renderer TypeScript：`tsc --noEmit -p src/renderer/tsconfig.json` 通过。
- `en-us.json`、`zh-cn.json`、`zh-tw.json`：JSON 解析通过。
- `pnpm build:renderer`：Webpack 生产构建通过。
- 原有 Electron 进程 PID `64404` 在回归后仍存活。

BetterLyrics：

- Core 测试项目：`22/22` 通过。
- WinUI x64 Debug：构建 0 错误；保留仓库既有警告，其中包括 `SQLitePCLRaw.lib.e_sqlite3` 的 `NU1903`。
- XAML/三语 RESW XML、重复键、三语占位符、`git diff --check`：通过。

阶段提交：

- IKUN `d94725b feat: 支持播客原始链接分享`
- IKUN `ff37021 feat: 支持播客长逐字稿分页分享`
- IKUN `7d8d8fc fix: 加固播客长文本分页与分享链接`
- IKUN `c546e71 feat: 完善播客多页分享体验`
- BetterLyrics `d65b1692 feat: 支持播客长逐字稿分页分享`
- BetterLyrics `ce07f191 fix: 加固播客长歌词批量分享`

## 最终判定

IKUN 已完成 AurioClub 18 个 HTTP 接口的客户端功能映射和运行链路接入，播客长逐字稿分页、批量分享以及原始文章/音频回退在本轮验证范围内工作正常；分享 UI 在键盘可达性、44px 命中区、异步反馈、错误恢复和长内容布局方面设计合理。BetterLyrics 已完成按样式容量分页及当前页/全部页/范围导出。

Apifox 项目已完成 `/sync/pull` 鉴权、`/proxy` 媒体类型契约及 18/18 默认成功 Mock，但仍缺完整自动化测试质量资源，并存在重复响应和项目摘要计数问题。当前总评为：**客户端交付完整，Apifox 治理进行中**。
