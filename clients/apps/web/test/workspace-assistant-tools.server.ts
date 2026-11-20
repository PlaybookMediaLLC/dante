import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { createToolRun } from '@/lib/ai/tools/executor'
import {
  type AssistantTurnState,
  workspaceAssistantTools,
} from '@/lib/ai/tools/workspace-assistant'
import type { OrganizationRole } from '@/lib/auth/permissions'

function setup(role: OrganizationRole) {
  const run = createToolRun({
    access: {
      deniedPermissions: [],
      organizationId: 'org_1',
      principal: { display: 'ada@example.com', kind: 'session', sessionId: 's_1', userId: 'u_1' },
      requestId: 'req_1',
      role,
    },
    audit: async () => {},
  })
  const state: AssistantTurnState = { known: new Set(['/home']), links: [], posts: [] }
  return { state, tools: workspaceAssistantTools(run, state) }
}

const options = { context: undefined as never, messages: [], toolCallId: 'call_1' }

/** Go's feature decisions as the web sees them: `allowed` features pass, others are refused. */
function mockFeatures(t: TestContext, allowed: readonly string[], status = 200) {
  const env = { ...process.env }
  process.env.PUBLISHING_API_URL = 'http://backend.test:8082'
  process.env.PUBLISHING_SERVICE_TOKEN = 'private-test-token'
  process.env.PLATFORM_CONTENT_DRAFTS = 'enabled'
  t.after(() => {
    for (const key of ['PUBLISHING_API_URL', 'PUBLISHING_SERVICE_TOKEN', 'PLATFORM_CONTENT_DRAFTS'])
      if (env[key] === undefined) delete process.env[key]
      else process.env[key] = env[key]
  })
  const asked: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = new URL(String(input instanceof Request ? input.url : input)).pathname
    const feature = decodeURIComponent(path.replace('/v1/entitlements/features/', ''))
    asked.push(feature)
    if (status !== 200) return Response.json({ error: 'down' }, { status })
    return Response.json({
      allowed: allowed.includes(feature),
      currentPlan: 'free',
      feature,
      requiredPlan: 'pro',
    })
  })
  return { asked }
}

test('startWork offers a new visual holding the request, once', async () => {
  const { state, tools } = setup('creator')
  const ask = 'A hero for "Invoices" & #2 — été'
  assert.ok((await tools.startWork.execute({ ask, kind: 'visual' }, options)).ok)
  assert.ok((await tools.startWork.execute({ ask, kind: 'visual' }, options)).ok)
  assert.equal(state.links.length, 1)
  const [link] = state.links
  assert.equal(link?.label, 'Start this visual')
  const url = new URL(link?.href ?? '', 'http://shots.test')
  assert.equal(url.pathname, '/editor')
  assert.equal(url.searchParams.get('start'), 'new')
  assert.equal(url.searchParams.get('ask'), ask)
})

test('a viewer is offered no way to start work', async () => {
  const { state, tools } = setup('viewer')
  const result = await tools.startWork.execute({ ask: 'A hero', kind: 'visual' }, options)
  assert.equal(result.ok, false)
  assert.deepEqual(state.links, [])
})

test('startWork shares the four-button limit with offerLink', async () => {
  const { state, tools } = setup('creator')
  for (const href of ['/a', '/b', '/c', '/d']) {
    state.known.add(href)
    assert.ok((await tools.offerLink.execute({ href, label: href }, options)).ok)
  }
  const result = await tools.startWork.execute({ ask: 'A hero', kind: 'visual' }, options)
  assert.equal(result.ok, false)
  assert.equal(state.links.length, 4)
})

test('a viewer cannot draft a post', async () => {
  const { state, tools } = setup('viewer')
  const result = await tools.draftPost.execute({ text: 'We shipped invoices.' }, options)
  assert.equal(result.ok, false)
  assert.deepEqual(state.posts, [])
})

test('draftPost offers at most two posts, even when the model asks for three at once', async (t) => {
  const { asked } = mockFeatures(t, ['content:drafts'])
  const { state, tools } = setup('creator')
  const results = await Promise.all(
    ['One', 'Two', 'Three'].map((text) => tools.draftPost.execute({ text }, options))
  )
  assert.deepEqual(
    results.map((result) => result.ok),
    [true, true, false]
  )
  assert.equal(state.posts.length, 2)
  // One plan read answers the whole turn.
  assert.deepEqual(asked, ['content:drafts'])
})

test('a plan without posts gets no post', async (t) => {
  mockFeatures(t, [])
  const { state, tools } = setup('creator')
  assert.equal((await tools.draftPost.execute({ text: 'Hi' }, options)).ok, false)
  assert.deepEqual(state.posts, [])
})

test('startWork opens a campaign with what shipped, only where campaigns are on', async (t) => {
  mockFeatures(t, ['campaign:workflow'])
  const { state, tools } = setup('creator')
  const shipped = 'Invoices now send reminders & #follow-ups'
  assert.ok((await tools.startWork.execute({ kind: 'campaign', shipped }, options)).ok)
  const url = new URL(state.links[0]?.href ?? '', 'http://shots.test')
  assert.equal(state.links[0]?.label, 'Start this campaign')
  assert.equal(url.pathname, '/campaigns')
  assert.equal(url.searchParams.get('ship'), shipped)
  // workspace:paid is refused here, so no canvas button.
  const canvas = await tools.startWork.execute(
    { kind: 'canvas', recipe: 'product-launch' },
    options
  )
  assert.equal(canvas.ok, false)
  assert.equal(state.links.length, 1)
})

test('startWork refuses a campaign where campaigns are off', async (t) => {
  mockFeatures(t, ['workspace:paid'])
  const { state, tools } = setup('creator')
  const result = await tools.startWork.execute({ kind: 'campaign', shipped: 'Invoices' }, options)
  assert.equal(result.ok, false)
  assert.deepEqual(state.links, [])
})

test('an unreachable plan check fails the call instead of claiming the plan lacks it', async (t) => {
  mockFeatures(t, [], 500)
  const { tools } = setup('creator')
  const result = await tools.draftPost.execute({ text: 'Hi' }, options)
  assert.equal(result.ok, false)
  assert.notEqual((result as { error?: string }).error, 'Posts are not on for this workspace.')
})
