import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  verifyAuditLog,
  verifyJsonReport,
  verifyJunitReport
} from './aurio-contract-verifier.mjs'

const projectId = '8689463'
const environmentId = '48178257'
const suiteId = '26854'
const mockPort = '48765'
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const mockServer = join(repoRoot, 'docs', 'apifox', projectId, 'mock-server.mjs')
const uploadReport = process.argv.includes('--upload-report')
const accessToken = process.env.APIFOX_ACCESS_TOKEN?.trim() || ''
const isWindows = process.platform === 'win32'
const abortController = new AbortController()
const childStates = new WeakMap()

let mockProcess
let apifoxProcess
let receivedSignal = ''
let stopPromise

if (accessToken && !/^[A-Za-z0-9_-]+$/.test(accessToken)) {
  throw new Error('APIFOX_ACCESS_TOKEN contains unsupported characters.')
}

function redact (value) {
  let result = String(value || '')
  if (accessToken) result = result.replaceAll(accessToken, '<redacted>')
  return result
    .replace(/afxp_[A-Za-z0-9]+/g, '<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
}

function environmentWithoutAccessToken (overrides = {}) {
  const environment = { ...process.env, ...overrides }
  delete environment.APIFOX_ACCESS_TOKEN
  return environment
}

function registerChild (child) {
  const state = {
    closed: false,
    error: null,
    outcome: null,
    promise: null
  }
  state.promise = new Promise(resolveClose => {
    child.once('error', error => { state.error = error })
    child.once('close', (code, signal) => {
      state.closed = true
      state.outcome = { code, signal, error: state.error }
      resolveClose(state.outcome)
    })
  })
  childStates.set(child, state)
  return child
}

function childState (child) {
  return child ? childStates.get(child) : null
}

function throwIfAborted () {
  if (abortController.signal.aborted) {
    throw abortController.signal.reason || new Error('Contract regression aborted.')
  }
}

function startMockServer (auditFile) {
  throwIfAborted()
  const child = registerChild(spawn(process.execPath, [mockServer], {
    cwd: repoRoot,
    detached: !isWindows,
    env: environmentWithoutAccessToken({
      AURIO_MOCK_HOST: '127.0.0.1',
      AURIO_MOCK_PORT: mockPort,
      AURIO_MOCK_AUDIT_FILE: auditFile
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }))

  mockProcess = child
  return child
}

async function waitForMockServer (child) {
  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })

  const ready = new Promise(resolveReady => {
    child.stdout.on('data', () => {
      if (stdout.includes(`AURIO_MOCK_READY http://127.0.0.1:${mockPort}`)) resolveReady()
    })
  })
  const closed = childState(child).promise.then(outcome => {
    const cause = outcome.error?.message || (outcome.code ?? outcome.signal)
    throw new Error(`Mock server exited before ready (${cause}): ${redact(stderr)}`)
  })

  let timeoutId
  const timeout = new Promise((_, rejectTimeout) => {
    timeoutId = setTimeout(() => rejectTimeout(new Error('Mock server readiness timed out.')), 10000)
  })

  try {
    await Promise.race([ready, closed, timeout])
    throwIfAborted()
  } finally {
    clearTimeout(timeoutId)
  }
}

function apifoxArguments (reportDir) {
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
    'json,junit',
    '--out-dir',
    reportDir,
    '--out-file',
    'aurio-contract-regression',
    '--ignore-redirects',
    '--timeout-request',
    '10000',
    '--timeout-script',
    '10000',
    '--color',
    'off'
  ]

  if (uploadReport) args.push('--upload-report')
  if (accessToken) args.push('--access-token', accessToken)
  // CLI 2.2.9 reads this flag internally but omits it from the command option schema.
  args.push('--', '--verbose')
  return args
}

async function waitForChildOutcome (child, timeoutMs, timeoutMessage) {
  let timeoutId
  const timeout = new Promise((_, rejectTimeout) => {
    timeoutId = setTimeout(() => rejectTimeout(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([childState(child).promise, timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runApifox (reportDir) {
  throwIfAborted()
  const args = apifoxArguments(reportDir)
  const executable = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'apifox'
  const spawnArgs = isWindows
    ? ['/d', '/s', '/c', 'apifox', ...args]
    : args

  const child = registerChild(spawn(executable, spawnArgs, {
    cwd: repoRoot,
    detached: !isWindows,
    env: environmentWithoutAccessToken(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }))
  apifoxProcess = child

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })

  let outcome
  try {
    outcome = await waitForChildOutcome(child, 120000, 'Apifox execution timed out.')
  } catch (error) {
    await stopProcess(child)
    throw error
  }
  throwIfAborted()

  if (outcome.error || outcome.code !== 0) {
    throw new Error(
      `Apifox exited with ${outcome.error?.message || (outcome.code ?? outcome.signal)}.\n` +
      `${redact(stdout)}\n${redact(stderr)}`
    )
  }
}

async function verifyReports (reportDir, auditFile) {
  const files = await readdir(reportDir)
  const jsonFiles = files.filter(file => file.endsWith('.json'))
  const junitFiles = files.filter(file => file.endsWith('.xml'))
  if (jsonFiles.length !== 1 || junitFiles.length !== 1) {
    throw new Error(
      `Expected one JSON and one JUnit report, found ${jsonFiles.length} JSON and ${junitFiles.length} JUnit.`
    )
  }

  const [jsonText, junitText, auditText] = await Promise.all([
    readFile(join(reportDir, jsonFiles[0]), 'utf8'),
    readFile(join(reportDir, junitFiles[0]), 'utf8'),
    readFile(auditFile, 'utf8')
  ])
  const jsonResult = verifyJsonReport(JSON.parse(jsonText))
  const junitResult = verifyJunitReport(junitText)
  const auditResult = verifyAuditLog(auditText)

  process.stdout.write(
    `AurioClub contract regression passed: ${jsonResult.steps} steps, ` +
    `${auditResult.requests} actual requests, ${junitResult.assertions} assertions, all isolated.\n`
  )
}

function delay (milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}

function processGroupExists (pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

function signalProcessGroup (pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function waitForProcessGroup (pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (processGroupExists(pid) && Date.now() < deadline) await delay(50)
  return !processGroupExists(pid)
}

async function runTaskkill (pid) {
  const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
    stdio: 'ignore',
    windowsHide: true
  })
  let timeoutId
  await new Promise((resolveKiller, rejectKiller) => {
    timeoutId = setTimeout(() => rejectKiller(new Error(`taskkill timed out for process ${pid}.`)), 3000)
    killer.once('error', rejectKiller)
    killer.once('close', resolveKiller)
  }).finally(() => clearTimeout(timeoutId))
}

async function stopProcess (child) {
  const state = childState(child)
  if (!child || !state) return

  if (isWindows) {
    if (state.closed) return
    await runTaskkill(child.pid)
    await waitForChildOutcome(child, 3000, `Child process ${child.pid} did not close after taskkill.`)
    return
  }

  if (!processGroupExists(child.pid)) return
  signalProcessGroup(child.pid, 'SIGTERM')
  let stopped = await waitForProcessGroup(child.pid, 2000)
  if (!stopped) {
    signalProcessGroup(child.pid, 'SIGKILL')
    stopped = await waitForProcessGroup(child.pid, 1000)
  }
  if (!state.closed) {
    await waitForChildOutcome(child, 1000, `Child process ${child.pid} did not close.`)
  }
  if (!stopped) throw new Error(`Unable to stop process group ${child.pid}.`)
}

async function stopChildren () {
  const errors = []
  for (const child of [apifoxProcess, mockProcess]) {
    try {
      await stopProcess(child)
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Unable to stop all contract regression processes.')
}

function stopAllProcesses () {
  if (!stopPromise) stopPromise = stopChildren()
  return stopPromise
}

const handledSignals = isWindows
  ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
  : ['SIGINT', 'SIGTERM']
for (const signal of handledSignals) {
  process.once(signal, () => {
    if (receivedSignal) return
    receivedSignal = signal
    process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 149
    abortController.abort(new Error(`Contract regression stopped by ${signal}.`))
    void stopAllProcesses().catch(() => {})
  })
}

async function main () {
  let tempRoot
  let failure

  try {
    tempRoot = await mkdtemp(join(tmpdir(), 'ikun-apifox-'))
    throwIfAborted()
    const reportDir = join(tempRoot, 'report')
    const auditFile = join(tempRoot, 'mock-requests.jsonl')
    await mkdir(reportDir)
    throwIfAborted()

    const child = startMockServer(auditFile)
    await waitForMockServer(child)
    await runApifox(reportDir)
    throwIfAborted()
    await verifyReports(reportDir, auditFile)
  } catch (error) {
    failure = error
  }

  const cleanupErrors = []
  try {
    await stopAllProcesses()
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (tempRoot) {
    try {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (failure && cleanupErrors.length > 0) {
    throw new AggregateError([failure, ...cleanupErrors], 'Contract regression and cleanup both failed.')
  }
  if (failure) throw failure
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Contract regression cleanup failed.')
}

main().catch(error => {
  if (receivedSignal) {
    process.stderr.write(`AurioClub contract regression stopped by ${receivedSignal}.\n`)
    if (error instanceof AggregateError) {
      process.stderr.write(`Cleanup failure: ${redact(error?.stack || error)}\n`)
    }
    return
  }
  process.stderr.write(`${redact(error?.stack || error)}\n`)
  process.exitCode = 1
})
