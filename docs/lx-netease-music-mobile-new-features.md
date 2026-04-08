# lx-netease-music-mobile 新功能研究报告

> 研究日期：2026-04-08
> 研究对象：`D:\project\WebStormProject\lx-netease-music-mobile` vs `D:\project\WebStormProject\ikun-music-desktop`

---

## 一、项目概述

### 1.1 lx-netease-music-mobile 技术栈

| 技术 | 版本/名称 |
|------|----------|
| 框架 | React Native |
| 语言 | TypeScript 5.7.3, JavaScript |
| 状态管理 | 自定义 Store 系统 |
| 导航 | react-native-navigation 7.39.2 |
| 音乐播放 | react-native-track-player |
| 视频播放 | react-native-video 6.17.0 |
| 网络请求 | axios, rn-fetch-blob |
| 加密 | react-native-quick-md5 |
| i18n | 自定义国际化方案 |

### 1.2 目录结构

```
src/
├── app.ts                    # 应用入口
├── components/               # UI 组件
│   ├── common/               # 通用组件 (Dialog, Modal, Button, Input)
│   ├── player/               # 播放器组件 (PlayerBar, Progress)
│   ├── DownloadBall/         # 下载悬浮球
│   └── MusicAddModal/        # 音乐添加模态框
├── config/                   # 配置模块
├── core/                     # 核心业务逻辑
│   ├── player/               # 播放器核心
│   ├── music/                # 音乐相关
│   ├── search/               # 搜索功能
│   ├── sync/                 # 同步功能 (WebDAV)
│   └── download.ts           # 下载管理
├── event/                    # 事件系统
├── lang/                     # 国际化 (en-us, zh-cn, zh-tw)
├── navigation/               # 导航配置
├── screens/                  # 页面
│   ├── Home/                 # 首页 (Vertical/Horizontal)
│   ├── PlayDetail/            # 播放详情
│   ├── SonglistDetail/        # 歌单详情
│   ├── ArtistDetail/          # 歌手详情
│   ├── AlbumDetail/           # 专辑详情
│   ├── Comment/              # 评论
│   ├── DownloadManager/       # 下载管理
│   └── SimilarSongs/          # 相似歌曲
├── store/                    # 状态存储
├── theme/                    # 主题系统
└── utils/                    # 工具函数
    └── musicSdk/             # 音乐 SDK (kw/kg/tx/wy/mg/yt/git)
```

---

## 二、新增功能详细清单

### 2.1 音乐源支持

#### 2.1.1 额外的 YouTube 音乐源

**文件路径**: `src/utils/musicSdk/yt/`

| 文件 | 功能 |
|------|------|
| `yt/api.js` | YouTube API 封装 |
| `yt/musicSearch.js` | 音乐搜索 |
| `yt/hotSearch.js` | 热搜词获取 |
| `yt/songList.js` | 歌单 |
| `yt/leaderboard.js` | 排行榜 |
| `yt/lyric.js` | 歌词获取 |
| `yt/album.js` | 专辑信息 |
| `yt/singer.js` | 歌手信息 |
| `yt/tipSearch.js` | 搜索建议 |
| `yt/pic.js` | 图片获取 |
| `yt/comment.js` | 评论 |
| `yt/musicInfo.js` | 音乐信息 |
| `yt/util.js` | 工具函数 |

**说明**: ikun-music-desktop 仅支持 kw/kg/tx/wy/mg/git 六个音乐源，lx-netease-music-mobile 额外支持 YouTube 音乐源。

---

### 2.2 播放器功能

#### 2.2.1 心跳播放模式

**文件**: `src/core/player/player.ts` 第 410 行

```typescript
case 'heartbeat':
```

**说明**: 支持心跳模式播放，用于实时流媒体场景。

#### 2.2.2 音频焦点处理

**文件**: `src/config/defaultSetting.ts` 第 41 行

```typescript
'player.isHandleAudioFocus': boolean
```

**说明**: 移动端特有功能，处理其他应用占用音频焦点时的行为。

#### 2.2.3 音频 Offload 模式

**文件**: `src/config/defaultSetting.ts` 第 42 行

```typescript
'player.isEnableAudioOffload': boolean
```

**说明**: Android 音频 Offload 模式，用于降低 CPU 占用。

#### 2.2.4 蓝牙歌词显示

**文件**: `src/config/defaultSetting.ts` 第 47 行

```typescript
'player.isShowBluetoothLyric': boolean
```

**说明**: 支持通过蓝牙设备显示歌词。

#### 2.2.5 播放历史记录 (Scrobble)

**文件**:
- `src/core/player/scrobble.ts` - 播放记录核心
- `src/core/player/scrobbleConfig.ts` - 配置

**功能**:
- 记录歌曲播放次数
- 上报播放历史到服务器
- 播放统计

#### 2.2.6 超时退出

**文件**: `src/core/player/timeoutExit.ts`

**功能**: 设置播放多长时间后自动退出。

#### 2.2.7 预加载下一首

**文件**: `src/core/init/player/preloadNextMusic.ts`

**功能**: 当前歌曲播放时预加载下一首，减少等待时间。

---

### 2.3 下载功能

#### 2.3.1 批量下载

**文件**: `src/core/download.ts` 第 377-399 行

```typescript
batchDownload(list, selectIndex, isInfoOnly, downloadPath)
```

**功能**:
- 支持歌单批量下载
- 支持选择起始位置
- 支持仅获取信息

#### 2.3.2 元信息重试机制

**文件**: `src/core/download.ts` 第 184-260 行

```typescript
retryMetadata(action)
```

**功能**: 下载后元信息（如封面、歌词）写入失败时可重试。

#### 2.3.3 封面写入

**文件**: `src/core/download.ts` 第 145-158 行

**功能**: 下载时将封面图片写入音频文件。

#### 2.3.4 歌词嵌入

**文件**: `src/core/download.ts` 第 162-181 行

**功能**:
- 支持写入内嵌歌词
- 支持独立 LRC 文件
- 支持罗马歌词、翻译歌词

#### 2.3.5 强制 Cookie 下载

**文件**: `src/core/download.ts` 第 48-62 行

```typescript
isRequireCookie: boolean
```

**功能**: 对于网易云高品质音源强制使用 Cookie 下载，解决 VIP 歌曲下载限制。

---

### 2.4 列表/歌单管理

#### 2.4.1 歌单详情缓存管理

**文件**: `src/core/songlist.ts` 第 256-262 行

```typescript
clearListDetailCache()
```

**功能**: 清除歌单详情缓存，节省存储空间。

#### 2.4.2 跨列表批量移动

**文件**: `src/core/list.ts` 第 75-82 行

```typescript
moveListMusics(fromListId, toListId, musicIds, addtimeLocation)
```

**功能**: 将歌曲从一个列表移动到另一个列表。

#### 2.4.3 列表自动更新

**文件**: `src/core/useApp/listAutoUpdate.ts`

**功能**: 定时更新歌单内容，保持最新。

---

### 2.5 WebDAV 同步系统

#### 2.5.1 WebDAV 同步核心

**文件**: `src/core/sync/webdavSync.ts`

**功能**:
- 歌单同步到自建服务器
- 冲突解决机制
- 首次同步确认

**关键代码位置**:
- 第 277-304 行: 首次同步确认
- 第 328-350 行: 冲突解决

#### 2.5.2 操作队列同步

**文件**: `src/core/sync/opQueue.ts`

**功能**:
- 离线操作记录
- 联网后自动合并
- 增量同步

#### 2.5.3 WebDAV 设置项

**文件**: `src/config/defaultSetting.ts` 第 106-113 行

```typescript
'sync.webdav.enable': boolean
'sync.webdav.url': string
'sync.webdav.username': string
'sync.webdav.password': string
'sync.webdav.dataKey': string
```

---

### 2.6 DeepLink 协议支持

#### 2.6.1 DeepLink 入口

**文件**: `src/core/init/deeplink/`

**支持的协议**:
- `lxmusic://` - 主协议
- 文件协议: `.lxmc`, `.js`, 音频文件

#### 2.6.2 文件协议处理

**文件**: `src/core/init/deeplink/fileAction.ts`

**功能**:
- 打开 `.lxmc` 歌单文件
- 执行 `.js` 脚本
- 直接播放音频文件

---

### 2.7 主题系统增强

#### 2.7.1 动态背景

**设置项**: `'theme.dynamicBg'`

**文件**: `src/core/init/theme.ts`, `src/core/theme.ts`

#### 2.7.2 背景模糊

**设置项**: `'theme.blur'`

#### 2.7.3 字体阴影

**设置项**: `'theme.fontShadow'`

#### 2.7.4 自定义背景图片

**设置项**: `'theme.customBgPicPath'`

#### 2.7.5 图片透明度

**设置项**: `'theme.picOpacity'`

#### 2.7.6 深色背景隐藏

**设置项**: `'theme.hideBgDark'`

---

### 2.8 移动端特有功能

#### 2.8.1 每日推荐

**文件**: `src/screens/Home/Views/DailyRec/`

**功能**: 网易云每日推荐歌单

#### 2.8.2 关注歌手

**文件**: `src/screens/Home/Views/FollowedArtists/`

**功能**: 关注喜欢的歌手

#### 2.8.3 专辑详情页

**文件**: `src/screens/AlbumDetail/`

**功能**: 专辑详细信息展示

#### 2.8.4 歌手详情页

**文件**: `src/screens/ArtistDetail/`

**功能**: 歌手详情+歌曲列表

#### 2.8.5 评论功能

**文件**: `src/screens/Comment/`

**功能**: 歌曲/歌单评论查看和发布

#### 2.8.6 下载管理器

**文件**: `src/screens/DownloadManager/`

**功能**: 专门的下载管理界面

#### 2.8.7 相似歌曲

**文件**: `src/screens/SimilarSongs/`

**功能**: 发现相似歌曲

#### 2.8.8 横屏/竖屏布局

**文件**: `src/core/init/uiMode.ts`

**功能**: 支持横屏和竖屏两种界面布局

---

### 2.9 国际化增强

#### 2.9.1 设备语言自动检测

**文件**: `src/core/init/i18n.ts` 第 12-14 行

```typescript
const deviceLang = NativeModules.I18n?.language || 'en'
```

#### 2.9.2 多语言支持

**文件**: `src/lang/`

**支持语言**:
- `en-us` - 英语
- `zh-cn` - 简体中文
- `zh-tw` - 繁体中文

---

### 2.10 其他新功能

#### 2.10.1 桌面歌词

**文件**: `src/core/desktopLyric.ts`

**功能**: Android 桌面歌词悬浮窗

#### 2.10.2 网络歌词

**文件**: `src/core/networkLyric.ts`

**功能**: 从网络获取歌词

#### 2.10.3 不喜欢列表

**文件**: `src/core/dislikeList.ts`

**功能**: 标记不喜欢的歌曲

---

## 三、新增代码文件清单

### 3.1 核心模块新增文件

| 文件路径 | 功能说明 |
|----------|----------|
| `src/core/player/scrobble.ts` | 播放历史记录 |
| `src/core/player/scrobbleConfig.ts` | 播放记录配置 |
| `src/core/player/timeoutExit.ts` | 超时退出功能 |
| `src/core/init/player/preloadNextMusic.ts` | 预加载下一首 |
| `src/core/init/deeplink/index.ts` | DeepLink 入口 |
| `src/core/init/deeplink/fileAction.ts` | 文件协议处理 |
| `src/core/init/uiMode.ts` | UI 模式切换 |
| `src/core/sync/webdavSync.ts` | WebDAV 同步 |
| `src/core/sync/opQueue.ts` | 操作队列同步 |
| `src/core/desktopLyric.ts` | 桌面歌词 |
| `src/core/networkLyric.ts` | 网络歌词 |
| `src/core/dislikeList.ts` | 不喜欢列表 |
| `src/core/useApp/listAutoUpdate.ts` | 列表自动更新 |

### 3.2 音乐源新增文件

| 文件路径 | 功能说明 |
|----------|----------|
| `src/utils/musicSdk/yt/api.js` | YouTube API |
| `src/utils/musicSdk/yt/musicSearch.js` | YouTube 搜索 |
| `src/utils/musicSdk/yt/hotSearch.js` | YouTube 热搜 |
| `src/utils/musicSdk/yt/songList.js` | YouTube 歌单 |
| `src/utils/musicSdk/yt/leaderboard.js` | YouTube 排行榜 |
| `src/utils/musicSdk/yt/lyric.js` | YouTube 歌词 |
| `src/utils/musicSdk/yt/album.js` | YouTube 专辑 |
| `src/utils/musicSdk/yt/singer.js` | YouTube 歌手 |
| `src/utils/musicSdk/yt/tipSearch.js` | YouTube 搜索建议 |
| `src/utils/musicSdk/yt/pic.js` | YouTube 图片 |
| `src/utils/musicSdk/yt/comment.js` | YouTube 评论 |
| `src/utils/musicSdk/yt/musicInfo.js` | YouTube 音乐信息 |
| `src/utils/musicSdk/yt/util.js` | YouTube 工具函数 |

### 3.3 页面新增文件

| 文件路径 | 功能说明 |
|----------|----------|
| `src/screens/Home/Views/DailyRec/` | 每日推荐 |
| `src/screens/Home/Views/FollowedArtists/` | 关注歌手 |
| `src/screens/AlbumDetail/` | 专辑详情 |
| `src/screens/ArtistDetail/` | 歌手详情 |
| `src/screens/Comment/` | 评论页面 |
| `src/screens/DownloadManager/` | 下载管理器 |
| `src/screens/SimilarSongs/` | 相似歌曲 |

### 3.4 配置新增文件

| 文件路径 | 功能说明 |
|----------|----------|
| `src/config/defaultSetting.ts` | 完整默认设置 |
| `src/config/setting.ts` | 设置管理 |
| `src/config/migrate.ts` | 数据迁移 |

---

## 四、功能对比总结

### 4.1 lx-netease-music-mobile 独有功能

| 类别 | 功能 | 重要性 |
|------|------|--------|
| 音乐源 | YouTube 音乐源 | 高 |
| 同步 | WebDAV 完整同步方案 | 高 |
| 协议 | DeepLink 协议支持 | 中 |
| 下载 | 批量下载+元信息处理 | 高 |
| 主题 | 动态背景+模糊效果 | 中 |
| 社交 | 每日推荐+关注歌手+评论 | 中 |
| 播放 | 心跳模式+预加载+Scrobble | 中 |
| 移动端 | 音频焦点+蓝牙歌词+横竖屏 | 低 |

### 4.2 ikun-music-desktop 独有功能

| 类别 | 功能 | 重要性 |
|------|------|--------|
| 桌面 | 系统托盘 | 高 |
| 网络 | 代理设置 | 中 |
| 开放 | 本地开放 API | 中 |
| 同步 | P2P 服务器同步模式 | 中 |
| 分享 | 音乐分享卡片 | 中 |
| 歌词 | 状态栏歌词 | 中 |

---

## 五、迁移建议

如果要将 lx-netease-music-mobile 的功能迁移到 ikun-music-desktop，可按以下优先级：

### 高优先级
1. WebDAV 同步系统
2. YouTube 音乐源
3. 批量下载与元信息处理

### 中优先级
1. DeepLink 协议支持
2. 动态主题系统
3. 每日推荐/关注歌手

### 低优先级
1. 心跳播放模式
2. 音频焦点处理
3. 移动端特有 UI 适配

---

*文档生成工具: Claude Code*
*生成时间: 2026-04-08*
