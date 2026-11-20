'use client'

import { MAX_ASSISTANT_MESSAGES, workspaceAssistantResponseSchema } from '@/lib/api/contracts/ai'
import type { AbilityRun, AssistantAbility } from '@/lib/assistant/ability'
import { internalHref } from '@/lib/assistant/page-context'

/**
 * The ability every page has: the workspace assistant, answering from the
 * page the person is on with read-only lookups and links to open.
 */
export const WORKSPACE_ABILITY_ID = 'workspace'

async function askWorkspace({ ask, memory, page, push, signal }: AbilityRun) {
  // A conversation past the request cap starts over; the page context still goes with it.
  const kept = memory.current.length + 1 > MAX_ASSISTANT_MESSAGES ? [] : memory.current
  const messages = [...kept, { content: ask, role: 'user' }]
  const response = await fetch('/api/ai/assistant', {
    body: JSON.stringify({ messages, page }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal,
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The assistant is unavailable.'
    throw new Error(error)
  }
  const reply = workspaceAssistantResponseSchema.parse(body)
  memory.current = [...messages, ...reply.messages]
  if (reply.text) push({ kind: 'assistant', text: reply.text })
  for (const link of reply.links) {
    const href = internalHref(link.href)
    if (href) push({ href, kind: 'link', text: link.label })
  }
}

/** The workspace assistant, labelled with the page it is asked from. */
export function workspaceAbility(pageTitle: string): AssistantAbility {
  return {
    id: WORKSPACE_ABILITY_ID,
    label: pageTitle || 'Workspace',
    placeholder: 'Ask about this page or your workspace',
    priority: 0,
    run: askWorkspace,
  }
}
