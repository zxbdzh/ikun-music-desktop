import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectId = '8689463'
const environmentId = '48178257'
const suiteId = '26854'
const mockPort = '48765'
const expected = {
  steps: 22,
  requests: 22,
  assertions: 60
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const mockServer = join(repoRoot, 'docs', 'apifox', projectId, 'mock-server.mjs')
const uploadReport = process.argv.includes('--upload-report')
const accessToken = process.env.APIFOX_ACCESS_TOKEN?.trim() || ''

if (accessToken && !/^[A-Za-z0-9_-]+$/.test(accessToken)) {
  throw new Error('APIFOX_ACCESS_TOKEN contains unsupported characters.')
}

function redact (value) {
  let result = String(value || '')
  if (accessToken) result = result.replaceAll(accessToken, '<redacted>')
  return result.replace(/afxp_[A-Za-z0-9]+/g, '<redacted>')
}

function startMockServer () {
  const child = spawn(process.execPath, [mockServer], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AURIO_MOCK_HOST: '127.0.0.1',
      AURIO_MOCK_PORT: mockPort
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  return child
}

async function waitForMockServer (child) {
  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })

  const ready = new Promise((resolveReady, rejectReady) => {
    const onData = () => {
      if (stdout.includes(`AURIO_MOCK_READY http://127.0.0.1:${mockPort}`)) {
        resolveReady()
      }
    }

    child.stdout.on('data', onData)
    child.once('error', rejectReady)
    child.once('exit', code => {
      rejectReady(new Error(`Mock server exited before ready (${code}): ${redact(stderr)}`))
    })
  })

  let timeoutId
  const timeout = new Promise((_, rejectTimeout) => {
    timeoutId = setTimeout(() => rejectTimeout(new Error('Mock server readiness timed out.')), 10000)
  })

  try {
    await Promise.race([ready, timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runApifox (reportDir) {
  const args = [
    'test-suite',
    'run',
    suiteId,
    '--project',
    projectId,
    '--environment',
    environmentId,
    '--global-var',
    'JWT_TOKEN=mock-token',
    '--reporters',
    'json',
    '--out-dir',
    reportDir,
    '--out-file',
    'aurio-contract-regression',
    '--color',
    'off'
  ]

  if (uploadReport) args.push('--upload-report')
  if (accessToken) args.push('--access-token', accessToken)

  const isWindows = process.platform === 'win32'
  const executable = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'apifox'
  const spawnArgs = isWindows
    ? ['/d', '/s', '/c', 'apifox', ...args]
    : args

  const child = spawn(executable, spawnArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })

  const [code] = await once(child, 'exit')
  if (code !== 0) {
    throw new Error(`Apifox exited with ${code}.\n${redact(stdout)}\n${redact(stderr)}`)
  }
}

function collectHttpItems (nodes, result = []) {
  for (const node of nodes || []) {
    if (node?.request?.url) result.push(node)
    if (Array.isArray(node?.item)) collectHttpItems(node.item, result)
  }
  return result
}

function assertStat (stats, name, total) {
  const value = stats?.[name]
  const passed = (value?.total || 0) - (value?.pending || 0) - (value?.failed || 0)
  if (value?.total !== total || passed !== total || value?.failed !== 0) {
    throw new Error(`Unexpected ${name} stats: ${JSON.stringify(value)}`)
  }
}

async function verifyReport (reportDir) {
  const files = (await readdir(reportDir)).filter(file => file.endsWith('.json'))
  if (files.length !== 1) {
    throw new Error(`Expected one JSON report, found ${files.length}.`)
  }

  const report = JSON.parse(await readFile(join(reportDir, files[0]), 'utf8'))
  const stats = report?.result?.stats
  assertStat(stats, 'steps', expected.steps)
  assertStat(stats, 'requests', expected.requests)
  assertStat(stats, 'assertions', expected.assertions)

  if (report?.result?.error || (report?.result?.failures || []).length > 0) {
    throw new Error('Apifox report contains runtime errors or failure items.')
  }

  const requests = collectHttpItems(report?.collection?.item)
  const nonLocalTargets = requests.filter(item => {
    const host = Array.isArray(item.request.url.host)
      ? item.request.url.host.join('.')
      : String(item.request.url.host || '')
    return host !== '127.0.0.1' || String(item.request.url.port) !== mockPort
  })

  if (requests.length !== expected.requests || nonLocalTargets.length > 0) {
    throw new Error(`Request isolation failed: ${requests.length} requests, ${nonLocalTargets.length} non-local targets.`)
  }

  process.stdout.write('AurioClub contract regression passed: 22 steps, 22 requests, 60 assertions, all isolated.\n')
}

async function stopProcess (child) {
  if (!child || child.exitCode !== null) return

  child.kill('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolveTimeout => setTimeout(resolveTimeout, 3000))
  ])

  if (child.exitCode === null) child.kill('SIGKILL')
}

async function main () {
  const tempRoot = await mkdtemp(join(tmpdir(), 'ikun-apifox-'))
  const reportDir = join(tempRoot, 'report')
  await mkdir(reportDir)

  let mockProcess
  try {
    mockProcess = startMockServer()
    await waitForMockServer(mockProcess)
    await runApifox(reportDir)
    await verifyReport(reportDir)
  } finally {
    await stopProcess(mockProcess)
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  process.stderr.write(`${redact(error?.stack || error)}\n`)
  process.exitCode = 1
})
