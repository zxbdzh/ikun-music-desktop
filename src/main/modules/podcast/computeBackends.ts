import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { discoverCudaRuntimeBins } from './asr'

export const CUDA_RUNTIME_FILES = [
  'cudart64_12.dll',
  'cublas64_12.dll',
  'cublasLt64_12.dll',
] as const

interface NvidiaDevice {
  name: string
  computeCapability: string | null
}

interface WhisperBackendManifest {
  cuda?: {
    computeCapabilities?: string[]
    ptxMinimumComputeCapability?: string
  }
}

interface CudaCompatibility {
  computeCapabilities: string[]
  ptxMinimumComputeCapability: string | null
}

export interface PodcastComputeBackendCapabilities {
  checkedAt: number
  asr: {
    gpuAvailable: boolean
    deviceName: string | null
    runtimeSource: LX.Podcast.ComputeRuntimeSource
    capabilityMessage: string
  }
  speakerDiarization: {
    gpuAvailable: boolean
    deviceName: string | null
    runtimeSource: LX.Podcast.ComputeRuntimeSource
    capabilityMessage: string
  }
}

interface InspectComputeBackendOptions {
  binaryDir: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  now?: number
  resolveSherpaAddon?: () => string
  queryDevices?: (env: NodeJS.ProcessEnv) => Promise<NvidiaDevice[]>
}

export const inspectPodcastComputeBackendCapabilities = async ({
  binaryDir,
  env = process.env,
  platform = process.platform,
  now = Date.now(),
  resolveSherpaAddon = () => require.resolve('sherpa-onnx-node/addon.js'),
  queryDevices = queryNvidiaDevices,
}: InspectComputeBackendOptions): Promise<PodcastComputeBackendCapabilities> => {
  const cudaBackendAvailable = existsSync(path.join(binaryDir, 'ggml-cuda.dll'))
  const runtimeDirectories = [binaryDir, ...discoverCudaRuntimeBins(env)]
  const cudaRuntimeDir = runtimeDirectories.find((directory) =>
    CUDA_RUNTIME_FILES.every((file) => existsSync(path.join(directory, file)))
  )
  const systemRoot = env.SystemRoot ?? env.WINDIR ?? 'C:\\Windows'
  const cudaDriverAvailable = platform === 'win32' &&
    existsSync(path.join(systemRoot, 'System32', 'nvcuda.dll'))
  const devices = platform === 'win32' ? await queryDevices(env) : []
  const compatibility = readCudaCompatibility(binaryDir)
  const compatibleDevice = devices.find((device) =>
    isCudaDeviceCompatible(device, compatibility)
  )
  const incompatibleDevice = devices.length > 0 && !compatibleDevice
  const cudaReady = platform === 'win32' && cudaBackendAvailable && !!cudaRuntimeDir &&
    cudaDriverAvailable && !incompatibleDevice
  const runtimeSource: LX.Podcast.ComputeRuntimeSource = !cudaRuntimeDir
    ? null
    : path.resolve(cudaRuntimeDir) === path.resolve(binaryDir)
      ? 'bundled'
      : 'system'

  const directMlSystemAvailable = platform === 'win32' &&
    existsSync(path.join(systemRoot, 'System32', 'DirectML.dll'))
  const directMlProviderAvailable = platform === 'win32' &&
    hasSherpaDirectMlProvider(resolveSherpaAddon)
  const directMlReady = directMlSystemAvailable && directMlProviderAvailable

  return {
    checkedAt: now,
    asr: {
      gpuAvailable: cudaReady,
      deviceName: (compatibleDevice ?? devices[0])?.name ?? null,
      runtimeSource,
      capabilityMessage: cudaCapabilityMessage({
        platform,
        cudaBackendAvailable,
        cudaDriverAvailable,
        runtimeSource,
        incompatibleDevice,
        compatibility,
      }),
    },
    speakerDiarization: {
      gpuAvailable: directMlReady,
      deviceName: null,
      runtimeSource: directMlProviderAvailable ? 'bundled' : null,
      capabilityMessage: directMlCapabilityMessage(
        platform,
        directMlSystemAvailable,
        directMlProviderAvailable
      ),
    },
  }
}

export const createPodcastComputeBackendStatus = (
  capabilities: PodcastComputeBackendCapabilities,
  statuses: Iterable<LX.Podcast.TranscriptionStatus>,
  preferCuda: boolean,
  platform: NodeJS.Platform = process.platform
): LX.Podcast.ComputeBackendStatus => {
  const values = [...statuses]
  const latestAsr = latestStatus(values, (status) => status.asrExecutor != null)
  const latestSpeaker = latestStatus(values, (status) => status.executor != null)
  return {
    checkedAt: capabilities.checkedAt,
    asr: {
      preferredExecutor: preferCuda ? 'cuda' : 'cpu',
      actualExecutor: latestAsr?.asrExecutor ?? null,
      actualUpdatedAt: latestAsr?.updatedAt ?? null,
      ...capabilities.asr,
      fallbackReason: latestAsr?.asrExecutorFallbackReason ?? null,
    },
    speakerDiarization: {
      preferredExecutor: platform === 'win32' ? 'directml' : 'cpu',
      actualExecutor: latestSpeaker?.executor ?? null,
      actualUpdatedAt: latestSpeaker?.updatedAt ?? null,
      ...capabilities.speakerDiarization,
      fallbackReason: latestSpeaker?.executorFallbackReason ?? null,
    },
  }
}

export const hasSherpaDirectMlProvider = (
  resolveSherpaAddon: () => string = () => require.resolve('sherpa-onnx-node/addon.js')
) => {
  try {
    const sherpaPackageDir = path.dirname(resolveSherpaAddon())
    return existsSync(path.join(
      path.dirname(sherpaPackageDir),
      'sherpa-onnx-win-x64',
      'onnxruntime_providers_directml.dll'
    ))
  } catch {
    return false
  }
}

const latestStatus = (
  statuses: LX.Podcast.TranscriptionStatus[],
  predicate: (status: LX.Podcast.TranscriptionStatus) => boolean
) => statuses
  .filter(predicate)
  .sort((left, right) => right.updatedAt - left.updatedAt)[0]

const readCudaCompatibility = (binaryDir: string): CudaCompatibility => {
  try {
    const value = JSON.parse(readFileSync(
      path.join(binaryDir, 'backend-manifest.json'),
      'utf8'
    )) as WhisperBackendManifest
    return {
      computeCapabilities: value.cuda?.computeCapabilities ?? [],
      ptxMinimumComputeCapability: value.cuda?.ptxMinimumComputeCapability ?? null,
    }
  } catch {
    return { computeCapabilities: [], ptxMinimumComputeCapability: null }
  }
}

const isCudaDeviceCompatible = (
  device: NvidiaDevice,
  compatibility: CudaCompatibility
) => {
  if (!device.computeCapability) return true
  if (compatibility.computeCapabilities.includes(device.computeCapability)) return true
  if (!compatibility.ptxMinimumComputeCapability) {
    return compatibility.computeCapabilities.length === 0
  }
  const actual = Number(device.computeCapability)
  const minimum = Number(compatibility.ptxMinimumComputeCapability)
  return Number.isFinite(actual) && Number.isFinite(minimum) && actual >= minimum
}

const cudaCapabilityMessage = ({
  platform,
  cudaBackendAvailable,
  cudaDriverAvailable,
  runtimeSource,
  incompatibleDevice,
  compatibility,
}: {
  platform: NodeJS.Platform
  cudaBackendAvailable: boolean
  cudaDriverAvailable: boolean
  runtimeSource: LX.Podcast.ComputeRuntimeSource
  incompatibleDevice: boolean
  compatibility: CudaCompatibility
}) => {
  if (platform !== 'win32') return 'CUDA 转写当前仅随 Windows x64 版本提供'
  if (!cudaBackendAvailable) return 'CUDA ASR 后端未打包，转写将使用 CPU'
  if (!cudaDriverAvailable) return '未检测到 NVIDIA 显卡驱动，转写将使用 CPU'
  if (!runtimeSource) return '未找到 CUDA 12 运行库；请安装 CUDA 版 IKUN 或 CUDA 12.x'
  if (incompatibleDevice) {
    return compatibility.ptxMinimumComputeCapability
      ? `当前 CUDA 后端要求计算能力不低于 ${compatibility.ptxMinimumComputeCapability}`
      : `当前 CUDA 后端仅支持计算能力 ${compatibility.computeCapabilities.join(' / ')}`
  }
  return runtimeSource === 'bundled'
    ? 'CUDA 12 运行库已随安装包提供'
    : '正在使用本机 CUDA 12.x 运行库'
}

const directMlCapabilityMessage = (
  platform: NodeJS.Platform,
  systemAvailable: boolean,
  providerAvailable: boolean
) => {
  if (platform !== 'win32') return '当前平台不支持 DirectML，已使用 CPU 进行说话人分离'
  if (!providerAvailable) {
    return '当前 sherpa-onnx 预编译版本未启用 DirectML，已使用 CPU 进行说话人分离'
  }
  if (!systemAvailable) return '系统 DirectML 运行库不可用，已使用 CPU 进行说话人分离'
  return 'sherpa-onnx DirectML provider 已就绪'
}

const queryNvidiaDevices = (env: NodeJS.ProcessEnv) => new Promise<NvidiaDevice[]>((resolve) => {
  const systemRoot = env.SystemRoot ?? env.WINDIR ?? 'C:\\Windows'
  const systemExecutable = path.join(systemRoot, 'System32', 'nvidia-smi.exe')
  const executable = existsSync(systemExecutable) ? systemExecutable : 'nvidia-smi.exe'
  execFile(
    executable,
    ['--query-gpu=name,compute_cap', '--format=csv,noheader'],
    { env, timeout: 2_500, windowsHide: true },
    (error, stdout) => {
      if (error) {
        resolve([])
        return
      }
      resolve(String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const parts = line.split(',').map((part) => part.trim())
        const computeCapability = parts.pop() || null
        return { name: parts.join(', '), computeCapability }
      }))
    }
  )
})
