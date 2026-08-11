import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CUDA_RUNTIME_FILES,
  createPodcastComputeBackendStatus,
  inspectPodcastComputeBackendCapabilities,
  type PodcastComputeBackendCapabilities,
} from './computeBackends'

const capabilities = (): PodcastComputeBackendCapabilities => ({
  checkedAt: 5_000,
  asr: {
    gpuAvailable: true,
    deviceName: 'NVIDIA GeForce RTX 5090',
    runtimeSource: 'bundled',
    capabilityMessage: 'CUDA 12 运行库已随安装包提供',
  },
  speakerDiarization: {
    gpuAvailable: false,
    deviceName: null,
    runtimeSource: null,
    capabilityMessage: '当前 sherpa-onnx 预编译版本未启用 DirectML，已使用 CPU 进行说话人分离',
  },
})

const transcriptionStatus = (
  value: Partial<LX.Podcast.TranscriptionStatus>
): LX.Podcast.TranscriptionStatus => ({
  protocolVersion: 2,
  contentId: 'episode-1',
  transcriptState: 'ready',
  transcriptSource: 'asr',
  revision: 1,
  isPartial: false,
  model: 'small',
  modelState: 'ready',
  stage: 'completed',
  progress: 1,
  updatedAt: 1_000,
  ...value,
})

describe('podcast compute backend status', () => {
  it('reports ASR and speaker diarization as separate actual executors', () => {
    const result = createPodcastComputeBackendStatus(capabilities(), [
      transcriptionStatus({
        contentId: 'asr-episode',
        asrExecutor: 'cuda',
        updatedAt: 2_000,
      }),
      transcriptionStatus({
        contentId: 'speaker-episode',
        executor: 'cpu',
        executorFallbackReason: 'DirectML 初始化失败，已回退 CPU',
        updatedAt: 3_000,
      }),
    ], true, 'win32')

    expect(result.asr).toMatchObject({
      preferredExecutor: 'cuda',
      actualExecutor: 'cuda',
      actualUpdatedAt: 2_000,
      gpuAvailable: true,
    })
    expect(result.speakerDiarization).toMatchObject({
      preferredExecutor: 'directml',
      actualExecutor: 'cpu',
      actualUpdatedAt: 3_000,
      gpuAvailable: false,
      fallbackReason: 'DirectML 初始化失败，已回退 CPU',
    })
  })

  it('shows configured preferences when no task has selected an executor yet', () => {
    const result = createPodcastComputeBackendStatus(capabilities(), [], false, 'win32')

    expect(result.asr).toMatchObject({
      preferredExecutor: 'cpu',
      actualExecutor: null,
      actualUpdatedAt: null,
    })
    expect(result.speakerDiarization).toMatchObject({
      preferredExecutor: 'directml',
      actualExecutor: null,
      actualUpdatedAt: null,
    })
  })

  it('detects a self-contained CUDA runtime beside whisper.cpp', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ikun-cuda-status-'))
    const binaryDir = path.join(root, 'whisper')
    const systemRoot = path.join(root, 'Windows')
    try {
      await mkdir(path.join(systemRoot, 'System32'), { recursive: true })
      await mkdir(binaryDir, { recursive: true })
      await Promise.all([
        writeFile(path.join(systemRoot, 'System32', 'nvcuda.dll'), ''),
        writeFile(path.join(binaryDir, 'ggml-cuda.dll'), ''),
        ...CUDA_RUNTIME_FILES.map((file) => writeFile(path.join(binaryDir, file), '')),
        writeFile(path.join(binaryDir, 'backend-manifest.json'), JSON.stringify({
          cuda: {
            computeCapabilities: ['12.0'],
            ptxMinimumComputeCapability: '7.5',
          },
        })),
      ])

      const result = await inspectPodcastComputeBackendCapabilities({
        binaryDir,
        platform: 'win32',
        env: { SystemRoot: systemRoot, ProgramFiles: path.join(root, 'Program Files') },
        resolveSherpaAddon: () => { throw new Error('not installed') },
        queryDevices: async () => [{
          name: 'NVIDIA GeForce RTX 4090',
          computeCapability: '8.9',
        }],
        now: 8_000,
      })

      expect(result.asr).toEqual({
        gpuAvailable: true,
        deviceName: 'NVIDIA GeForce RTX 4090',
        runtimeSource: 'bundled',
        capabilityMessage: 'CUDA 12 运行库已随安装包提供',
      })
      expect(result.speakerDiarization.capabilityMessage).toBe(
        '当前 sherpa-onnx 预编译版本未启用 DirectML，已使用 CPU 进行说话人分离'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
