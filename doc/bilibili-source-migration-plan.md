# 哔哩哔哩音源移植计划（含歌单持久化）

> 来源参考项目：`../lx-lxwalnut-music-mobile`（React Native 版）
> 目标项目：`ikun-music-desktop`（Electron + Vue 3）
> 目标：在桌面端引入 bilibili 音源，**能搜索、能播放、能收藏进歌单并持久化**，且与"同样移植过的客户端"之间可同步互通。

---

## 一、背景与现状结论

参考项目把 B 站视频当作"歌曲"：搜索视频 → 取 `cid` → 调 `playurl?fnval=16` 拿 DASH 音频流 → 带防盗链头返回。
其 songmid 形如 `bilibili_<bvid>`，B 站特有字段（`bvid/aid/cid`）保存在 `_bilibiliData`，并持久化进歌单结构的 `meta._bilibiliData`。

当前 `ikun-music-desktop` 现状（已核实）：

| 检查项 | 现状 | 影响 |
|---|---|---|
| 音源目录 `src/renderer/utils/musicSdk/` | 仅 kw/kg/tx/wy/mg/git，**无 bilibili** | 需新增插件 |
| `LX.OnlineSource` 类型（`src/common/types/common.d.ts:48`） | `'kw'｜'kg'｜'tx'｜'wy'｜'mg'｜'git'`，**无 bilibili** | 需扩类型 |
| `LX.Quality`（同文件 `:50`） | 已含 `'192k'` ✅ | 无需改 |
| 持久化转换器（`src/common/utils/tools.ts`） | `toNewMusicInfo`/`toOldMusicInfo` **无 bilibili 分支** | 需加分支（持久化核心）|
| 音源注册（`src/renderer/utils/musicSdk/index.ts`） | `sources` 数组无 bilibili | 需注册 |
| 播放取链路（`src/renderer/core/music/utils.ts:373`） | 只取 `{ url, type }`，**丢弃 headers** | 需透传 headers |
| 同步（list_sync） | 整份列表 JSON 传输，不按源过滤 | `meta._bilibiliData` 可随同步传递 ✅ |

**核心结论**：歌单持久化能否成立，取决于 `toNewMusicInfo`/`toOldMusicInfo` 是否保留 `_bilibiliData`（参考项目正是这么改的）。这是本计划的重中之重。

---

## 二、改动清单（按依赖顺序）

### 步骤 1：扩展类型定义

**文件 `src/common/types/common.d.ts`**
```ts
type OnlineSource = 'kw' | 'kg' | 'tx' | 'wy' | 'mg' | 'git' | 'bilibili'
```

**文件 `src/common/types/music.d.ts`**：新增 bilibili 的 meta 与 MusicInfo 接口，并并入联合类型。
```ts
interface MusicInfoMeta_bilibili extends MusicInfoMeta_online {
  _bilibiliData: {
    bvid?: string
    aid?: string | number
    cid?: string | number
  }
}
interface MusicInfo_bilibili extends MusicInfoBase<'bilibili'> {
  meta: MusicInfoMeta_bilibili
}
// 并入联合
type MusicInfoOnline =
  | MusicInfo_online_common | MusicInfo_kg | MusicInfo_tx | MusicInfo_mg | MusicInfo_bilibili
```
> 同时把 `MusicInfo_online_common` 的源集合保持不变，bilibili 单独成接口即可。

---

### 步骤 2：移植音源插件

新建目录 `src/renderer/utils/musicSdk/bilibili/`，从参考项目移植两份文件：

- `index.js`（`getBilibiliMusicUrl` / `getCid` / 插件对象）
- `musicSearch.js`（搜索、指纹 Cookie、多 P 拆分）

**移植时必须做的适配**：

1. **请求库**：参考项目用 `import { httpFetch } from '../../request'`。需改为桌面端对应的 `httpFetch`/请求封装（查 `musicSdk` 内现有源如何发请求，复用同一个）。
2. **日志**：参考项目大量 `searchLog` 调试日志，可替换为桌面端 logger 或直接精简删除（核心逻辑不依赖日志）。
3. **设置项**：`musicSearch.js` 读取 `settingState.setting['common.bilibili_multi_page']`（多 P 开关）。桌面端需：
   - 要么在 `defaultSetting` 中新增该项；
   - 要么先写死 `true`/`false`，后续再接设置 UI。
4. **音质**：`getMusicUrl` 内固定 `192k`（与 B 站音质 ID 30280 对应），桌面端 `Quality` 已支持 `192k`，无需改。

---

### 步骤 3：注册音源

**文件 `src/renderer/utils/musicSdk/index.ts`**
```ts
import bilibili from './bilibili/index'
// sources 数组追加：
{ name: '哔哩哔哩', id: 'bilibili' },
// sources 对象追加：
bilibili,
```
> 注意：`searchMusic` 的 `excludeSource` 默认排除 `['xm']`，bilibili 不在其中，会被纳入聚合搜索；若不希望 bilibili 参与"全网搜索/换源匹配"，把 `'bilibili'` 加进 `excludeSource`。

---

### 步骤 4：歌单持久化（**核心**）

**文件 `src/common/utils/tools.ts`** —— 在两个转换器各加 bilibili 分支。

`toNewMusicInfo`（旧 → 新，入库/收藏时调用），在 `switch (oldMusicInfo.source)` 内追加：
```ts
case 'bilibili':
  meta._bilibiliData = oldMusicInfo._bilibiliData
  break
```

`toOldMusicInfo`（新 → 旧，取链/播放时调用），在 `switch (minfo.source)` 内追加：
```ts
case 'bilibili':
  oInfo._bilibiliData = minfo.meta._bilibiliData
  break
```

> 这样 B 站歌曲收藏进"我的歌单"后，`bvid/aid/cid` 会写入 `meta._bilibiliData` 并随歌单一起持久化，重启后仍可解析播放。
> **兜底**：即使 `_bilibiliData` 缺失，插件 `getMusicUrl` 仍会从 `songmid`（`bilibili_<bvid>`）正则反解 bvid，二次保险。

---

### 步骤 5：播放时透传防盗链 headers（Electron 关键难点）

B 站音频 CDN 校验 `referer` 与 `user-agent`，**否则 403**。插件 `getMusicUrl` 返回的是 `{ url, headers, type }`，但 `src/renderer/core/music/utils.ts:381` 当前只解构 `{ url, type }`，**headers 被丢弃**。

RN 端有自定义播放器可带 header，Electron 的 `<audio>` 标签默认带 Electron 自身 UA、无 referer，直接播放会失败。需二选一方案：

- **方案 A（推荐）**：主进程用 `session.defaultSession.webRequest.onBeforeSendHeaders` 拦截 `*.bilivideo.com` / `*.mcdn.bilivideo.com` 请求，注入 `referer: https://www.bilibili.com` 与桌面 Chrome UA。改动集中在主进程，渲染层几乎不动。
- **方案 B**：把 `headers` 从 `handleGetOnlineMusicUrl` 一路透传到播放器/下载模块，由播放层逐请求设置（改动面大，且 audio 标签难设 referer）。

> 建议落地方案 A：新增主进程模块（如 `src/main/modules/bilibiliHeaders.ts`），在 app ready 后注册一次 webRequest 拦截。下载功能（`src/renderer/core/music/download.ts`）同理需要这组 header，方案 A 可一并覆盖。

---

### 步骤 6：歌词与封面（可选）

- `getLyric`：B 站无歌词，参考项目返回占位 `[00:00.00] 哔哩哔哩 (゜-゜)つロ 干杯~`，直接沿用。
- `getPic`：返回搜索时存的 `img` 即可。
- `songList`：参考项目为空占位实现，防止 UI 调用报错，沿用。

---

## 三、跨端同步说明

- 同步走整份列表 JSON 序列化（list_sync），`meta._bilibiliData` 会原样传输，**不被按源过滤**。
- 对端为 **同样移植过本音源的客户端** → 能看到、能播放。
- 对端为 **官方 lx-music / 未移植的客户端** → 列表条目大概率能显示（名称/歌手），但 `source='bilibili'` 无对应 `getMusicUrl`，**点播放会失败**；严格校验源白名单的客户端可能在导入时丢弃或报错该条目。

---

## 四、验证清单

1. `pnpm run lint` 通过，TS 类型无报错（步骤 1 类型扩展是否到位）。
2. 搜索框选"哔哩哔哩"源，能搜出视频结果；多 P 视频按设置拆分/合并。
3. 点击播放：能正常出声（步骤 5 headers 生效，无 403）。
4. 收藏到"我的歌单" → 重启 App → 仍能播放（步骤 4 持久化生效）。
5. 下载：能下载成功（headers 覆盖下载请求）。
6. 两台都移植过的客户端间同步：歌单含 B 站歌曲，两端均可播放。

---

## 五、风险与注意事项

- **headers 透传是成败关键**：不解决步骤 5，搜索/收藏都正常，但一播放就 403，体验上等于"不可用"。优先验证此项。
- **B 站接口风控/变更**：指纹 Cookie 接口、search/type、playurl 均为 Web 端非公开 API，B 站策略调整可能导致失效。
- **`better-sqlite3` 原生模块**：本次改动不涉及 DB schema，无需 `pnpm run rebuild`；但歌单数据落库格式新增了 `meta._bilibiliData` 字段（JSON 字段，向后兼容，旧数据无此字段不影响）。
- **音质固定 192k**：UI 上若展示音质切换，对 bilibili 源应锁定/隐藏，避免误导。

---

## 六、改动文件汇总

| 文件 | 改动 |
|---|---|
| `src/common/types/common.d.ts` | `OnlineSource` 增 `'bilibili'` |
| `src/common/types/music.d.ts` | 新增 `MusicInfoMeta_bilibili`/`MusicInfo_bilibili`，并入联合 |
| `src/renderer/utils/musicSdk/bilibili/index.js` | 新增（移植+适配请求库/日志/设置）|
| `src/renderer/utils/musicSdk/bilibili/musicSearch.js` | 新增（移植+适配）|
| `src/renderer/utils/musicSdk/index.ts` | 注册 bilibili 源 |
| `src/common/utils/tools.ts` | `toNewMusicInfo`/`toOldMusicInfo` 加 bilibili 分支（持久化核心）|
| `src/renderer/core/music/utils.ts` | 透传 headers（或改用主进程拦截方案）|
| `src/main/modules/bilibiliHeaders.ts`（新增，方案 A）| webRequest 注入 referer/UA |
| `src/renderer/store/setting` + `defaultSetting` | 新增多 P 开关（可选）|
