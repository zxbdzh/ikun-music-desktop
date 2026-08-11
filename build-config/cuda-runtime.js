const fs = require('fs')
const path = require('path')

const CUDA_RUNTIME_FILES = [
  'cudart64_12.dll',
  'cublas64_12.dll',
  'cublasLt64_12.dll',
]

const bundleCudaRuntime = process.env.IKUN_BUNDLE_CUDA_RUNTIME === '1'

const findCudaRuntimeDirectory = (env = process.env) => {
  const candidates = []
  if (env.IKUN_CUDA_REDIST_DIR) candidates.push(env.IKUN_CUDA_REDIST_DIR)
  for (const [key, value] of Object.entries(env)) {
    if (/^CUDA_PATH(?:_V\d+_\d+)?$/i.test(key) && value) {
      candidates.push(path.join(value, 'bin'))
    }
  }
  const toolkitRoot = path.join(
    env.ProgramFiles || 'C:\\Program Files',
    'NVIDIA GPU Computing Toolkit',
    'CUDA'
  )
  if (fs.existsSync(toolkitRoot)) {
    candidates.push(...fs.readdirSync(toolkitRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(toolkitRoot, entry.name, 'bin'))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true })))
  }
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))]
    .find((candidate) => CUDA_RUNTIME_FILES.every((file) =>
      fs.existsSync(path.join(candidate, file))
    ))
}

const createCudaExtraResources = (env = process.env) => {
  if (env.IKUN_BUNDLE_CUDA_RUNTIME !== '1') return []
  const runtimeDirectory = findCudaRuntimeDirectory(env)
  if (!runtimeDirectory) {
    throw new Error(
      `IKUN_BUNDLE_CUDA_RUNTIME=1，但未找到完整的 CUDA 12 运行库：${CUDA_RUNTIME_FILES.join(', ')}`
    )
  }
  const toolkitRoot = path.dirname(runtimeDirectory)
  const eulaPath = ['EULA.txt', 'LICENSE']
    .map((file) => path.join(toolkitRoot, file))
    .find((file) => fs.existsSync(file))
  if (!eulaPath) {
    throw new Error(`CUDA 运行库目录缺少 EULA：${toolkitRoot}`)
  }
  console.log(`[cuda] 将随安装包提供 CUDA 12 运行库：${runtimeDirectory}`)
  return [
    ...CUDA_RUNTIME_FILES.map((file) => ({
      from: path.join(runtimeDirectory, file),
      to: path.join('podcast', 'whisper', file),
    })),
    {
      from: eulaPath,
      to: path.join('podcast', 'whisper', 'LICENSE.cuda.txt'),
    },
  ]
}

module.exports = {
  CUDA_RUNTIME_FILES,
  bundleCudaRuntime,
  createCudaExtraResources,
  findCudaRuntimeDirectory,
}
