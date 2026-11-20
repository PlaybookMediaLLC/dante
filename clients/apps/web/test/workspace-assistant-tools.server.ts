import assert from 'node:assert/strict'
import test from 'node:test'
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
