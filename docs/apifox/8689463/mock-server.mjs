import { createServer } from 'node:http'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))
const host = process.env.AURIO_MOCK_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.AURIO_MOCK_PORT || '48765', 10)
const auditFile = process.env.AURIO_MOCK_AUDIT_FILE || ''

if (host !== '127.0.0.1') {
  throw new Error('AURIO_MOCK_HOST must remain 127.0.0.1.')
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid AURIO_MOCK_PORT: ${process.env.AURIO_MOCK_PORT}`)
}

if (auditFile && !isAbsolute(auditFile)) {
  throw new Error('AURIO_MOCK_AUDIT_FILE must be an absolute path.')
}

if (auditFile) writeFileSync(auditFile, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' })

const routeFiles = new Map([
  ['GET /auth/me', 'auth-me-success.json'],
  ['PUT /auth/profile', 'auth-profile-success.json'],
  ['POST /auth/send-code', 'auth-send-code-success.json'],
  ['POST /auth/login-password', 'auth-login-password-success.json'],
  ['POST /auth/login-email', 'auth-login-email-success.json'],
  ['POST /auth/register-password', 'auth-register-password-success.json'],
  ['POST /auth/reset-password', 'auth-reset-password-success.json'],
  ['POST /auth/change-password', 'auth-change-password-success.json'],
  ['POST /auth/link-device', 'auth-link-device-success.json'],
  ['GET /sync/pull', 'sync-pull-success.json'],
  ['POST /sync/progress', 'sync-progress-success.json'],
  ['POST /sync/preferences', 'sync-preferences-success.json'],
  ['POST /sync/progress/batch', 'sync-progress-batch-success.json'],
  ['GET /podcasts', 'podcasts-success.json'],
  ['GET /stats/popular-sources', 'popular-sources-success.json'],
  ['GET /proxy', 'proxy-success.json'],
  ['POST /track', 'track-success.json'],
  ['GET /api/itunes-search', 'itunes-search-success.json']
])

const fixtures = new Map(
  [...routeFiles].map(([route, file]) => {
    const payload = JSON.parse(readFileSync(join(rootDir, 'mocks', file), 'utf8'))
    return [route, payload.response]
  })
)

function normalizePath (pathname) {
  if (pathname === '/api/v1') return '/'
  return pathname.startsWith('/api/v1/')
    ? pathname.slice('/api/v1'.length)
    : pathname
}

function sendJson (response, status, body) {
  const data = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  })
  response.end(data)
}

function hasBearer (request) {
  return /^Bearer\s+\S+$/i.test(request.headers.authorization || '')
}

function sendFixture (response, fixture) {
  const headers = Object.fromEntries(
    fixture.headers.map(({ key, value }) => [key, value])
  )

  if (fixture.code === 204) {
    response.writeHead(204, headers)
    response.end()
    return
  }

  const data = fixture.bodyType === 'json'
    ? JSON.stringify(fixture.bodyData)
    : String(fixture.bodyData)

  headers['Content-Length'] = Buffer.byteLength(data)
  response.writeHead(fixture.code, headers)
  response.end(data)
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || host}`)
  const pathname = normalizePath(url.pathname)
  const route = `${request.method} ${pathname}`

  if (auditFile) {
    response.once('finish', () => {
      appendFileSync(auditFile, `${JSON.stringify({
        method: request.method,
        path: url.pathname,
        status: response.statusCode,
        host: request.headers.host || '',
        remoteAddress: request.socket.remoteAddress || ''
      })}\n`, 'utf8')
    })
  }

  if (route === 'GET /auth/me' && !hasBearer(request)) {
    sendJson(response, 401, {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Bearer token is required.',
      trace_id: 'mock_auth_me_noauth',
      data: {}
    })
    return
  }

  if (route === 'GET /sync/pull' && !hasBearer(request) && !url.searchParams.get('user_id')) {
    sendJson(response, 401, {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Bearer token or user_id is required.',
      trace_id: 'mock_sync_pull_noauth',
      data: {}
    })
    return
  }

  if (route === 'GET /proxy' && !url.searchParams.get('url')) {
    sendJson(response, 400, { error: 'url query parameter is required' })
    return
  }

  if (route === 'GET /api/itunes-search' && url.searchParams.get('term') === '__rate_limit__') {
    sendJson(response, 429, { error: 'iTunes search failed', status: 429 })
    return
  }

  const fixture = fixtures.get(route)
  if (!fixture) {
    sendJson(response, 404, { error: `No fixture for ${route}` })
    return
  }

  sendFixture(response, fixture)
})

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

server.listen(port, host, () => {
  process.stdout.write(`AURIO_MOCK_READY http://${host}:${port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
