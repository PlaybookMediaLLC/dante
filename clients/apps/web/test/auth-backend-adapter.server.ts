import assert from 'node:assert/strict'
import { type TestContext, test } from 'node:test'
import { backendAuthAdapter } from '../lib/auth/backend-adapter'

const at = '2026-11-18T00:00:00.000Z'
const user = {
  createdAt: at,
  email: 'ada@example.test',
  emailVerified: true,
  id: 'user_1',
  name: 'Ada',
  updatedAt: at,
}
const session = {
  createdAt: at,
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: 'session_1',
  token: 'token_1',
  updatedAt: at,
  userId: 'user_1',
}

type StoreBody = { join?: unknown; model: string; op: string }

/** Records each auth-store request the adapter sends and answers it with `respond`. */
function backend(t: TestContext, respond: (body: StoreBody) => Response): StoreBody[] {
  const old = { url: process.env.PUBLISHING_API_URL, token: process.env.PUBLISHING_SERVICE_TOKEN }
  process.env.PUBLISHING_API_URL = 'http://backend.test:8082'
  process.env.PUBLISHING_SERVICE_TOKEN = 'private-test-token'
  t.after(() => {
    if (old.url === undefined) delete process.env.PUBLISHING_API_URL
    else process.env.PUBLISHING_API_URL = old.url
    if (old.token === undefined) delete process.env.PUBLISHING_SERVICE_TOKEN
    else process.env.PUBLISHING_SERVICE_TOKEN = old.token
  })
  const calls: StoreBody[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'http://backend.test:8082/v1/internal/auth-store')
    const body = JSON.parse(String(init?.body)) as StoreBody
    calls.push(body)
    return respond(body)
  })
  return calls
}

const findSession = () =>
  backendAuthAdapter({ experimental: { joins: true } }).findOne<
    typeof session & { user: typeof user }
  >({
    join: { user: true },
    model: 'session',
    where: [{ field: 'token', value: 'token_1' }],
  })

test('a session arrives with its user in one auth-store call', async (t) => {
  const calls = backend(t, () => Response.json({ row: { ...session, user } }))
  const found = await findSession()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]!.join, {
    user: { limit: 1, on: { from: 'userId', to: 'id' }, relation: 'one-to-one' },
  })
  assert.equal(found?.user.email, 'ada@example.test')
  assert.equal(found?.id, 'session_1')
})

test('an older backend that refuses join still gets the user, read on its own', async (t) => {
  const calls = backend(t, (body) => {
    if (body.join) return Response.json({ error: 'invalid auth store request' }, { status: 400 })
    return Response.json({ row: body.model === 'user' ? user : session })
  })
  const found = await findSession()
  assert.deepEqual(
    calls.map((call) => [call.model, Boolean(call.join)]),
    [
      ['session', true],
      ['session', false],
      ['user', false],
    ]
  )
  assert.equal(found?.user.email, 'ada@example.test')
})

test('a backend that ignores join still gets the user, read on its own', async (t) => {
  const calls = backend(t, (body) => Response.json({ row: body.model === 'user' ? user : session }))
  const found = await findSession()
  assert.deepEqual(
    calls.map((call) => [call.model, Boolean(call.join)]),
    [
      ['session', true],
      ['session', false],
      ['user', false],
    ]
  )
  assert.equal(found?.user.email, 'ada@example.test')
})

test('a refusal that is not about join is not retried', async (t) => {
  for (const [status, error] of [
    [503, 'unavailable'],
    [400, 'invalid auth store request: join relation "x"'],
  ] as const) {
    await t.test(`${status} ${error}`, async (t) => {
      const calls = backend(t, () => Response.json({ error }, { status }))
      await assert.rejects(findSession())
      assert.equal(calls.length, 1)
    })
  }
})

test('a list falls back per row, with an empty list for a missing key', async (t) => {
  const users = [user, { ...user, email: 'bob@example.test', id: 'user_2' }]
  const calls = backend(t, (body) => {
    if (body.join) return Response.json({ error: 'invalid auth store request' }, { status: 400 })
    if (body.model === 'user')
      return Response.json({ row: null, rows: [users[0], { ...users[1], id: null }] })
    return Response.json({ row: null, rows: [session] })
  })
  const listed = await backendAuthAdapter({ experimental: { joins: true } }).findMany<
    typeof user & { session: (typeof session)[] }
  >({ join: { session: true }, model: 'user', where: [] })
  assert.deepEqual(calls[0]!.join, {
    session: { limit: 100, on: { from: 'id', to: 'userId' }, relation: 'one-to-many' },
  })
  assert.deepEqual(
    calls.map((call) => call.model),
    ['user', 'user', 'session']
  )
  assert.deepEqual(
    listed.map((row) => row.session.length),
    [1, 0]
  )
})
