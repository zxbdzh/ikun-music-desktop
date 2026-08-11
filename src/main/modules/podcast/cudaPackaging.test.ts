import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const cudaPackaging = require('../../../../build-config/cuda-runtime.js') as {
  CUDA_RUNTIME_FILES: string[]
  createCudaExtraResources: (env: NodeJS.ProcessEnv) => Array<{ from: string; to: string }>
  findCudaRuntimeDirectory: (env: NodeJS.ProcessEnv) => string | undefined
}

describe('CUDA runtime packaging', () => {
  it('requires the complete redistributable set and ships its EULA', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ikun-cuda-package-'))
    const runtimeDir = path.join(root, 'bin')
    try {
      await mkdir(runtimeDir, { recursive: true })
      await Promise.all(cudaPackaging.CUDA_RUNTIME_FILES.map((file) =>
        writeFile(path.join(runtimeDir, file), file)
      ))
      await writeFile(path.join(root, 'EULA.txt'), 'test license')
      const env = {
        IKUN_BUNDLE_CUDA_RUNTIME: '1',
        IKUN_CUDA_REDIST_DIR: runtimeDir,
        ProgramFiles: path.join(root, 'Program Files'),
      }

      expect(cudaPackaging.findCudaRuntimeDirectory(env)).toBe(path.resolve(runtimeDir))
      expect(cudaPackaging.createCudaExtraResources(env)).toEqual([
        ...cudaPackaging.CUDA_RUNTIME_FILES.map((file) => ({
          from: path.join(runtimeDir, file),
          to: path.join('podcast', 'whisper', file),
        })),
        {
          from: path.join(root, 'EULA.txt'),
          to: path.join('podcast', 'whisper', 'LICENSE.cuda.txt'),
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not add CUDA payloads to the standard installer', () => {
    expect(cudaPackaging.createCudaExtraResources({})).toEqual([])
  })
})
