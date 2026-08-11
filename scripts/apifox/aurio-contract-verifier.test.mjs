import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  aurioExpected,
  verifyAuditLog,
  verifyJsonReport,
  verifyJunitReport
} from './aurio-contract-verifier.mjs'

const regressionWorkflow = readFileSync(
  new URL('../../.github/workflows/aurio-contract-regression.yml', import.meta.url),
  'utf8'
)

function reportItem ([method, path], index) {
  return {
    name: `request-${index}`,
    request: {
      method,
      url: {
        protocol: 'http',
        host: ['127', '0', '0', '1'],
        port: '48765',
        path: path.slice(1).split('/')
      }
    },
    event: []
  }
}

function validJsonReport () {
  let assertion = 0
  const executions = aurioExpected.hits.map(([method, path], index) => {
    const assertionCount = index < 16 ? 3 : 2
    return {
      request: { method, url: `http://127.0.0.1:48765${path}` },
      requestError: null,
      scriptErrors: [],
      scriptRequests: [],
      assertions: Array.from({ length: assertionCount }, () => ({
        name: `assertion-${++assertion}`,
        passed: true,
        skipped: false,
        error: null
      }))
    }
  })

  return {
    result: {
      stats: {
        steps: { total: 22, passed: 22, failed: 0 },
        requests: { total: 22, pending: 0, failed: 0 },
        assertions: { total: 60, pending: 0, failed: 0 }
      },
      failures: [],
      error: null,
      executions
    },
    options: { ignoreRedirects: true },
    collection: {
      item: aurioExpected.hits.map(reportItem)
    }
  }
}

function validJunitReport () {
  let assertion = 0
  const suites = Array.from({ length: aurioExpected.steps }, (_, suiteIndex) => {
    const tests = suiteIndex < 16 ? 3 : 2
    const cases = Array.from({ length: tests }, () => {
      assertion += 1
      return `<testcase name="assertion-${assertion}"/>`
    }).join('')
    return `<testsuite tests="${tests}" failures="0" errors="0">${cases}</testsuite>`
  }).join('')
  return `<?xml version="1.0"?><testsuites tests="22">${suites}</testsuites>`
}

function validAuditLog () {
  return aurioExpected.hits.map(([method, path, status]) => JSON.stringify({
    method,
    path,
    status,
    host: '127.0.0.1:48765',
    remoteAddress: '127.0.0.1'
  })).join('\n')
}

test('accepts complete JSON, JUnit, and Mock audit evidence', () => {
  const report = validJsonReport()
  delete report.result.executions[0].scriptRequests
  assert.deepEqual(verifyJsonReport(report), {
    steps: 22,
    requests: 22,
    assertions: 60,
    executions: 22
  })
  assert.deepEqual(verifyJunitReport(validJunitReport()), {
    suites: 22,
    assertions: 60
  })
  assert.deepEqual(verifyAuditLog(validAuditLog()), { requests: 22 })
})

test('keeps privileged regression on main and the protected environment', () => {
  assert.match(regressionWorkflow, /^    if: github\.ref == 'refs\/heads\/main'$/m)
  assert.match(regressionWorkflow, /^    environment: aurio-contract-regression$/m)
  assert.match(
    regressionWorkflow,
    /Missing APIFOX_ACCESS_TOKEN Environment Secret in protected environment aurio-contract-regression/
  )
  assert.doesNotMatch(regressionWorkflow, /^  pull_request(?:_target)?:/m)
  assert.doesNotMatch(regressionWorkflow, /APIFOX_ACCESS_TOKEN repository secret/i)
})

test('rejects JSON stats that do not explicitly pass every step', () => {
  const report = validJsonReport()
  report.result.stats.steps.passed = 21
  assert.throws(() => verifyJsonReport(report), /passed count/)
})

test('rejects skipped assertions even when aggregate stats pass', () => {
  const report = validJsonReport()
  report.result.executions[0].assertions[0].skipped = true
  assert.throws(() => verifyJsonReport(report), /verbose assertions/)
})

test('rejects missing or unsafe verbose execution evidence', () => {
  const mutations = [
    report => { delete report.result.executions },
    report => { report.result.executions[0].request.url = 'https://example.com/api/v1/auth/me' },
    report => { report.result.executions[0].scriptRequests = {} },
    report => { report.result.executions[0].scriptRequests = [{ url: 'https://example.com' }] },
    report => { report.result.executions[0].requestError = { message: 'failed' } },
    report => { report.result.executions[0].scriptErrors = {} },
    report => { report.result.executions[0].scriptErrors = [{ message: 'failed' }] }
  ]

  for (const mutate of mutations) {
    const report = validJsonReport()
    mutate(report)
    assert.throws(() => verifyJsonReport(report))
  }
})

test('rejects static scripts that can issue an extra request', () => {
  const report = validJsonReport()
  report.collection.item[0].event.push({
    script: { exec: ['pm.sendRequest("https://example.com")'] }
  })
  assert.throws(() => verifyJsonReport(report), /Outbound script request API/)
})

test('rejects skipped JUnit assertions', () => {
  const xml = validJunitReport().replace(
    '<testcase name="assertion-1"/>',
    '<testcase name="assertion-1"><skipped/></testcase>'
  )
  assert.throws(() => verifyJunitReport(xml), /Unexpected JUnit assertion result/)
})

test('rejects truncated JUnit XML', () => {
  const xml = validJunitReport()
    .replaceAll('</testsuite>', '')
    .replace('</testsuites>', '')
  assert.throws(() => verifyJunitReport(xml), /complete XML document|mismatched closing tag/)
})

test('rejects JUnit evidence hidden in comments or under another root', () => {
  const xml = validJunitReport()
  const evidence = xml.slice(xml.indexOf('<testsuite '), xml.lastIndexOf('</testsuites>'))
  assert.throws(
    () => verifyJunitReport(`<?xml version="1.0"?><testsuites tests="22"><!--${evidence}--></testsuites>`),
    /direct JUnit suites/
  )
  assert.throws(
    () => verifyJunitReport(xml
      .replace('<testsuites tests="22">', '<not-junit tests="22">')
      .replace('</testsuites>', '</not-junit>')),
    /testsuites root/
  )
})

test('rejects non-integer JUnit counters', () => {
  for (const invalidValue of ['22junk', '22.9']) {
    const xml = validJunitReport().replace('tests="22"', `tests="${invalidValue}"`)
    assert.throws(() => verifyJunitReport(xml), /Invalid JUnit tests attribute/)
  }
})

test('rejects a missing runtime Mock hit', () => {
  const lines = validAuditLog().split('\n')
  lines.pop()
  assert.throws(() => verifyAuditLog(lines.join('\n')), /Unexpected Mock request audit/)
})

test('rejects an extra runtime Mock hit', () => {
  const lines = validAuditLog().split('\n')
  lines.push(lines[0])
  assert.throws(() => verifyAuditLog(lines.join('\n')), /Unexpected Mock request audit/)
})

test('rejects sensitive or unapproved Mock audit fields', () => {
  const lines = validAuditLog().split('\n')
  const record = JSON.parse(lines[0])
  record.authorization = 'redacted-value'
  lines[0] = JSON.stringify(record)
  assert.throws(() => verifyAuditLog(lines.join('\n')), /unexpected fields/)
})
