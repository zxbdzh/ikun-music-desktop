# 播客与逐字稿

IKUN Music 负责播客目录、RSS、播放队列、下载、缓存、发布者逐字稿和本地语音识别。未登录时所有本地功能仍可使用；登录只用于 AurioClub 云同步。

BetterLyrics 通过 IKUN Music 现有 Open API 地址读取当前逐字稿。逐字稿端点仅接受本机回环连接，并且只允许读取当前播放内容。BetterLyrics 不接收账户凭据、音频或完整播客资料。

## 本地识别资源

模型在首次使用时根据 `src/static/podcast/model-manifest.json` 下载并校验 SHA-256。Windows x64 安装包从 `src/static/podcast/whisper/` 打包以下二进制文件：

- `whisper-cli.exe` 及 `ggml` DLL：whisper.cpp v1.9.2 x64。
- `ffmpeg.exe`：用于生成 16 kHz 单声道 PCM 输入。

生产包将这些文件放在 ASAR 外的 `resources/podcast/whisper/`，以便系统直接启动。运行时优先尝试 GPU 后端，没有可用 GPU 后端时使用 CPU。没有这些资源时，播客仍会正常播放，逐字稿状态会明确显示为失败，不会上传音频。

Windows 提供两种交付方式：标准安装包体积较小，CUDA 转写复用用户机器已有的 CUDA 12.x；名称包含 `CUDA` 的安装包会将 `cudart64_12.dll`、`cublas64_12.dll` 和 `cublasLt64_12.dll` 放在 whisper.cpp 同目录，因此用户只需安装支持 CUDA 12 的 NVIDIA 驱动。`nvcuda.dll` 始终由 NVIDIA 驱动提供，不可随应用复制。两种安装包都保留 CPU 后端，并在 CUDA 初始化失败时自动回退。

CUDA 后端包含 `sm_75` 与 `sm_120a` 原生代码，并携带 `compute_75` PTX；RTX 20/30/40 系列可由 NVIDIA 驱动从 PTX 即时编译，RTX 50 系列使用原生 Blackwell 路径。计算能力低于 7.5 的旧显卡会在设置页显示不兼容并使用 CPU，避免启动任务后才静默失败。

CUDA 安装包通过 `pnpm pack:win:setup:x64:cuda` 构建。构建机必须安装 CUDA 12 Toolkit，或者用 `IKUN_CUDA_REDIST_DIR` 指向包含上述三个 DLL 的合法再分发目录；缺少 DLL 或 EULA 时构建会直接失败。CUDA 运行库依据 Toolkit EULA Attachment A 随应用再分发，许可证写入 `resources/podcast/whisper/LICENSE.cuda.txt`。

设置页的“计算后端”分别显示语音转写和说话人分离的设备能力、首选后端、最近任务实际后端与回退原因。当前 `sherpa-onnx-win-x64@1.13.4` 预编译包没有 DirectML provider，所以说话人分离会明确显示 CPU；系统存在 `DirectML.dll` 并不代表该原生模块已经启用 DirectML。

没有发布者逐字稿的节目会先下载音频和所选模型，再在本机生成逐字稿。首次使用和较长节目需要等待；生成完成后 IKUN 会更新当前歌词，BetterLyrics 也可从本机 Open API 读取。旧版本留下的本地识别失败记录会在下一次请求时重试。

本地识别使用全局串行队列，同一时间只运行一个 FFmpeg/Whisper 任务，避免多个长节目同时争抢 CPU、内存和磁盘。切换节目不会让旧任务覆盖当前播放状态；已进入队列的任务仍会在后台完成并缓存结果。

分发二进制文件时，必须同时附带对应的 whisper.cpp、FFmpeg 及其构建依赖许可证。模型来源与固定校验值记录在模型清单中。
