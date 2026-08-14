# 播客与逐字稿

IKUN Music 负责播客目录、RSS、播放队列、下载、缓存和发布者逐字稿。未登录时本地播放与资料库功能仍可使用；登录只用于 AurioClub 云同步。

BetterLyrics 通过 IKUN Music 现有 Open API 地址读取当前逐字稿。逐字稿端点仅接受本机回环连接，并且只允许读取当前播放内容。BetterLyrics 不接收账户凭据、音频或完整播客资料。

## Voxrail 云端转写

字幕选择顺序是：发布者逐字稿、已有完整本地字幕、Voxrail 云端字幕。没有可用字幕时，IKUN 向 Voxrail 提交 Feed URL、单集 ID、GUID、标题和公开音频地址提示；IKUN 不上传音频文件。

Voxrail 在服务器端解析公开音频，完成语音识别、说话人分离和可选 AI 身份标注。IKUN 轮询只读任务状态，将协议 v2 字幕映射回本地单集 ID 后缓存。旧版本已经生成的完整本地字幕仍可读取，但客户端不再创建、重试或标注本地转写任务。

云端请求在 5 分钟窗口内复用同一个幂等键。短暂网络故障会在窗口内安全重试；云任务失败后，IKUN 在本地熔断到下一个窗口再自动提交，避免播放器的字幕轮询反复创建任务。

在播客设置中填写 Voxrail 服务地址和 Access Key。公网服务地址必须使用 HTTPS，仅本机开发的 `localhost`、`127.0.0.1` 或 `[::1]` 可使用 HTTP。Key 使用 Electron `safeStorage` 加密写入本机 session 文件，界面只显示是否已配置，不回显原文。连接测试读取当前额度，不创建转写任务。

安装包不再包含 Whisper、FFmpeg、CUDA 运行库、ASR 模型或 sherpa-onnx 原生模块。所有转写计算都由 Voxrail Worker 承担。
