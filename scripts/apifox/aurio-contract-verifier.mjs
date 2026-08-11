const localHost = '127.0.0.1'
const mockPort = '48765'

export const aurioExpected = Object.freeze({
  steps: 22,
  requests: 22,
  assertions: 60,
  hits: Object.freeze([
    ['GET', '/api/v1/auth/me', 401],
    ['GET', '/api/v1/auth/me', 200],
    ['PUT', '/api/v1/auth/profile', 200],
    ['POST', '/api/v1/auth/send-code', 200],
    ['POST', '/api/v1/auth/login-password', 200],
    ['POST', '/api/v1/auth/login-email', 200],
    ['POST', '/api/v1/auth/register-password', 200],
    ['POST', '/api/v1/auth/reset-password', 200],
    ['POST', '/api/v1/auth/change-password', 200],
    ['POST', '/api/v1/auth/link-device', 200],
    ['GET', '/api/v1/sync/pull', 401],
    ['GET', '/api/v1/sync/pull', 200],
    ['POST', '/api/v1/sync/progress', 200],
    ['POST', '/api/v1/sync/preferences', 200],
    ['POST', '/api/v1/sync/progress/batch', 200],
    ['GET', '/api/v1/podcasts', 200],
    ['GET', '/api/v1/stats/popular-sources', 200],
    ['GET', '/api/v1/proxy', 400],
    ['GET', '/api/v1/proxy', 200],
    ['POST', '/api/v1/track', 204],
    ['GET', '/api/itunes-search', 200],
    ['GET', '/api/itunes-search', 429]
  ])
})

function collectHttpItems (nodes, result = []) {
  for (const node of nodes || []) {
    if (node?.request?.url) result.push(node)
    if (Array.isArray(node?.item)) collectHttpItems(node.item, result)
  }
  return result
}

function assertStat (stats, name, total, requirePassed = false) {
  const value = stats?.[name]
  const pending = value?.pending || 0
  const failed = value?.failed || 0

  if (value?.total !== total || pending !== 0 || failed !== 0) {
    throw new Error(`Unexpected ${name} stats: ${JSON.stringify(value)}`)
  }

  if (requirePassed && value?.passed !== total) {
    throw new Error(`Unexpected ${name} passed count: ${JSON.stringify(value)}`)
  }
}

function requestTarget (item) {
  const url = item?.request?.url || {}
  const host = Array.isArray(url.host) ? url.host.join('.') : String(url.host || '')
  return {
    host,
    port: String(url.port || ''),
    protocol: String(url.protocol || '').replace(/:$/, '')
  }
}

function assertStaticIsolation (items) {
  const nonLocalTargets = items.filter(item => {
    const target = requestTarget(item)
    return target.protocol !== 'http' || target.host !== localHost || target.port !== mockPort
  })

  if (items.length !== aurioExpected.requests || nonLocalTargets.length > 0) {
    throw new Error(
      `Static request isolation failed: ${items.length} requests, ${nonLocalTargets.length} non-local targets.`
    )
  }
}

function assertNoScriptRequests (items) {
  const outboundPatterns = [
    /\bpm\.sendRequest\b/,
    /\bfetch\s*\(/,
    /\baxios\b/,
    /\bhttps?\.request\s*\(/,
    /\bnet\.connect\s*\(/,
    /\bWebSocket\s*\(/
  ]

  for (const item of items) {
    for (const event of item?.event || []) {
      const source = Array.isArray(event?.script?.exec)
        ? event.script.exec.join('\n')
        : String(event?.script?.exec || '')

      if (outboundPatterns.some(pattern => pattern.test(source))) {
        throw new Error(`Outbound script request API found in ${item.name || 'unnamed request'}.`)
      }
    }
  }
}

function rawRequestUrl (request) {
  const url = request?.url
  const protocol = String(url?.protocol || '').replace(/:$/, '')
  const host = Array.isArray(url?.host) ? url.host.join('.') : String(url?.host || '')
  const port = url?.port ? `:${url.port}` : ''
  const path = Array.isArray(url?.path) ? `/${url.path.join('/')}` : String(url?.path || '')
  if (protocol && host) return `${protocol}://${host}${port}${path}`
  if (typeof url === 'string') return url
  return typeof url?.raw === 'string' ? url.raw : ''
}

function assertExecutionEvidence (report) {
  const executions = report?.result?.executions
  if (!Array.isArray(executions) || executions.length !== aurioExpected.requests) {
    throw new Error(`Expected ${aurioExpected.requests} verbose executions, found ${executions?.length || 0}.`)
  }

  const assertions = executions.flatMap(execution => execution?.assertions || [])
  const invalidAssertions = assertions.filter(assertion => (
    assertion?.passed !== true || assertion?.skipped === true || assertion?.error
  ))
  if (assertions.length !== aurioExpected.assertions || invalidAssertions.length > 0) {
    throw new Error(
      `Unexpected verbose assertions: ${assertions.length} total, ${invalidAssertions.length} invalid.`
    )
  }

  for (const execution of executions) {
    const scriptErrors = execution?.scriptErrors
    const scriptRequests = execution?.scriptRequests
    if (
      execution?.requestError ||
      (scriptErrors !== undefined && !Array.isArray(scriptErrors)) ||
      (scriptErrors || []).length > 0 ||
      (scriptRequests !== undefined && !Array.isArray(scriptRequests)) ||
      (scriptRequests || []).length > 0
    ) {
      throw new Error('Verbose execution contains a request error, script error, or script HTTP request.')
    }

    let url
    try {
      url = new URL(rawRequestUrl(execution?.request))
    } catch {
      throw new Error('Verbose execution does not contain a valid actual request URL.')
    }

    if (url.protocol !== 'http:' || url.hostname !== localHost || url.port !== mockPort) {
      throw new Error(`Verbose execution escaped the isolated Mock origin: ${url.origin}.`)
    }
  }

  return { executions: executions.length, assertions: assertions.length }
}

export function verifyJsonReport (report) {
  const stats = report?.result?.stats
  assertStat(stats, 'steps', aurioExpected.steps, true)
  assertStat(stats, 'requests', aurioExpected.requests)
  assertStat(stats, 'assertions', aurioExpected.assertions)

  const failures = report?.result?.failures
  if (
    report?.result?.error ||
    (failures !== undefined && !Array.isArray(failures)) ||
    (failures || []).length > 0
  ) {
    throw new Error('Apifox JSON report contains runtime errors or failure items.')
  }

  if (report?.options?.ignoreRedirects !== true) {
    throw new Error('Apifox run did not disable HTTP redirects.')
  }

  const items = collectHttpItems(report?.collection?.item)
  assertStaticIsolation(items)
  assertNoScriptRequests(items)
  const executionEvidence = assertExecutionEvidence(report)

  return {
    steps: stats.steps.passed,
    requests: stats.requests.total,
    assertions: executionEvidence.assertions,
    executions: executionEvidence.executions
  }
}

function parseAttributes (tag) {
  const attributes = {}
  const pattern = /\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g
  for (const match of tag.matchAll(pattern)) attributes[match[1]] = match[2]
  return attributes
}

function assertXmlEntities (value) {
  if (/&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\dA-Fa-f]+);)/.test(value)) {
    throw new Error('JUnit report contains an invalid XML entity.')
  }
}

function findTagEnd (xml, start) {
  let quote = ''
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index]
    if (quote) {
      if (character === quote) quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index
    }
  }
  return -1
}

function assertWellFormedXml (xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('JUnit report is empty.')
  }

  const stack = []
  const elements = []
  let cursor = 0
  let rootCount = 0
  let declarationSeen = false

  while (cursor < xml.length) {
    const tagStart = xml.indexOf('<', cursor)
    const text = tagStart === -1 ? xml.slice(cursor) : xml.slice(cursor, tagStart)
    assertXmlEntities(text)
    if (stack.length === 0 && text.trim() !== '') {
      throw new Error('JUnit report contains text outside its root element.')
    }
    if (tagStart === -1) break

    if (xml.startsWith('<!--', tagStart)) {
      const commentEnd = xml.indexOf('-->', tagStart + 4)
      if (commentEnd === -1 || xml.slice(tagStart + 4, commentEnd).includes('--')) {
        throw new Error('JUnit report contains an invalid XML comment.')
      }
      cursor = commentEnd + 3
      continue
    }

    if (xml.startsWith('<![CDATA[', tagStart)) {
      const cdataEnd = xml.indexOf(']]>', tagStart + 9)
      if (stack.length === 0 || cdataEnd === -1) {
        throw new Error('JUnit report contains invalid CDATA.')
      }
      cursor = cdataEnd + 3
      continue
    }

    if (xml.startsWith('<?', tagStart)) {
      const instructionEnd = xml.indexOf('?>', tagStart + 2)
      const instruction = instructionEnd === -1 ? '' : xml.slice(tagStart, instructionEnd + 2)
      if (
        instructionEnd === -1 ||
        declarationSeen ||
        rootCount !== 0 ||
        !/^<\?xml\s+[^<>]+\?>$/.test(instruction)
      ) {
        throw new Error('JUnit report contains an invalid XML declaration.')
      }
      declarationSeen = true
      cursor = instructionEnd + 2
      continue
    }

    const tagEnd = findTagEnd(xml, tagStart)
    if (tagEnd === -1) throw new Error('JUnit report contains an unterminated XML tag.')
    const tag = xml.slice(tagStart, tagEnd + 1)
    assertXmlEntities(tag)

    const closing = tag.match(/^<\/([A-Za-z_:][\w:.-]*)\s*>$/)
    if (closing) {
      if (stack.pop()?.name !== closing[1]) {
        throw new Error(`JUnit report contains a mismatched closing tag: ${closing[1]}.`)
      }
      cursor = tagEnd + 1
      continue
    }

    const opening = tag.match(
      /^<([A-Za-z_:][\w:.-]*)(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*(\/?)>$/
    )
    if (!opening) throw new Error('JUnit report contains an invalid XML tag.')

    const attributeNames = [...tag.matchAll(/\s+([A-Za-z_:][\w:.-]*)\s*=/g)].map(match => match[1])
    if (new Set(attributeNames).size !== attributeNames.length) {
      throw new Error('JUnit report contains duplicate XML attributes.')
    }

    if (stack.length === 0) {
      rootCount += 1
      if (rootCount > 1) throw new Error('JUnit report contains multiple root elements.')
    }
    const element = {
      index: elements.length,
      name: opening[1],
      tag,
      depth: stack.length,
      parentIndex: stack.at(-1)?.index ?? null
    }
    elements.push(element)
    if (opening[2] !== '/') stack.push(element)
    cursor = tagEnd + 1
  }

  if (stack.length > 0 || rootCount !== 1) {
    throw new Error('JUnit report is not a complete XML document.')
  }
  return elements
}

function numberAttribute (attributes, name, fallback) {
  if (!(name in attributes)) return fallback
  const rawValue = attributes[name]
  const value = /^\d+$/.test(rawValue) ? Number(rawValue) : Number.NaN
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid JUnit ${name} attribute: ${attributes[name]}`)
  }
  return value
}

export function verifyJunitReport (xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('JUnit report contains a forbidden document type or entity declaration.')
  }
  const elements = assertWellFormedXml(xml)
  const rootElements = elements.filter(element => element.depth === 0)
  const rootElement = rootElements[0]
  if (rootElements.length !== 1 || rootElement.name !== 'testsuites') {
    throw new Error('Expected one JUnit testsuites root element.')
  }

  const root = parseAttributes(rootElement.tag)
  if (numberAttribute(root, 'tests', -1) !== aurioExpected.steps) {
    throw new Error(`Unexpected JUnit step count: ${root.tests || 'missing'}.`)
  }

  for (const name of ['failures', 'errors', 'skipped']) {
    if (numberAttribute(root, name, 0) !== 0) {
      throw new Error(`JUnit root reports ${name}: ${root[name]}.`)
    }
  }

  const allSuiteElements = elements.filter(element => element.name === 'testsuite')
  const suiteElements = allSuiteElements.filter(element => element.parentIndex === rootElement.index)
  if (
    suiteElements.length !== aurioExpected.steps ||
    allSuiteElements.length !== suiteElements.length
  ) {
    throw new Error(`Expected ${aurioExpected.steps} direct JUnit suites, found ${suiteElements.length}.`)
  }

  const testcaseElements = elements.filter(element => element.name === 'testcase')
  const totals = suiteElements.reduce((result, suite) => {
    const attributes = parseAttributes(suite.tag)
    const tests = numberAttribute(attributes, 'tests', 0)
    const testcaseCount = testcaseElements.filter(
      testcase => testcase.parentIndex === suite.index
    ).length
    if (testcaseCount !== tests) {
      throw new Error(`JUnit suite declares ${tests} tests but contains ${testcaseCount} testcases.`)
    }
    result.tests += tests
    result.failures += numberAttribute(attributes, 'failures', 0)
    result.errors += numberAttribute(attributes, 'errors', 0)
    result.skipped += numberAttribute(attributes, 'skipped', 0)
    return result
  }, { tests: 0, failures: 0, errors: 0, skipped: 0 })
  const testcaseCount = testcaseElements.length
  const failureCount = elements.filter(element => element.name === 'failure').length
  const errorCount = elements.filter(element => element.name === 'error').length
  const skippedCount = elements.filter(element => element.name === 'skipped').length

  if (
    totals.tests !== aurioExpected.assertions ||
    testcaseCount !== aurioExpected.assertions ||
    totals.failures !== 0 ||
    totals.errors !== 0 ||
    totals.skipped !== 0 ||
    failureCount !== 0 ||
    errorCount !== 0 ||
    skippedCount !== 0
  ) {
    throw new Error(
      `Unexpected JUnit assertion result: ${JSON.stringify({
        ...totals,
        testcases: testcaseCount,
        failureElements: failureCount,
        errorElements: errorCount,
        skippedElements: skippedCount
      })}`
    )
  }

  return { suites: suiteElements.length, assertions: testcaseCount }
}

function hitKey ([method, path, status]) {
  return `${method} ${path} ${status}`
}

export function verifyAuditLog (contents) {
  const lines = contents.split(/\r?\n/).filter(Boolean)
  const allowedKeys = ['host', 'method', 'path', 'remoteAddress', 'status']
  const records = lines.map((line, index) => {
    let record
    try {
      record = JSON.parse(line)
    } catch {
      throw new Error(`Mock audit line ${index + 1} is not valid JSON.`)
    }

    const keys = Object.keys(record).sort()
    if (keys.length !== allowedKeys.length || keys.some((key, keyIndex) => key !== allowedKeys[keyIndex])) {
      throw new Error(`Mock audit line ${index + 1} contains unexpected fields.`)
    }

    if (
      record.host !== `${localHost}:${mockPort}` ||
      record.remoteAddress !== localHost ||
      !/^(GET|POST|PUT)$/.test(record.method) ||
      typeof record.path !== 'string' ||
      !record.path.startsWith('/') ||
      record.path.includes('?') ||
      !Number.isInteger(record.status)
    ) {
      throw new Error(`Mock audit line ${index + 1} is not an isolated HTTP result.`)
    }

    return [record.method, record.path, record.status]
  })

  const actual = records.map(hitKey).sort()
  const expected = aurioExpected.hits.map(hitKey).sort()
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Unexpected Mock request audit: ${JSON.stringify(actual)}`)
  }

  return { requests: actual.length }
}
