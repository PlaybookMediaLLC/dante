'use client'

import { MAX_ASSISTANT_MESSAGES, workspaceAssistantResponseSchema } from '@/lib/api/contracts/ai'
import type { AbilityRun, AssistantAbility } from '@/lib/assistant/ability'
import { internalHref } from '@/lib/assistant/page-context'

/**
 * The ability every page has: the workspace assistant, answering from the
 * page the person is on with read-only lookups and links to open.
 */
const WORKSPACE_ABILITY_ID = 'workspace'

/**
 * The newest `room` messages, starting at one of the person's, so a tool call
 * is never sent without the result that answered it.
 */
export function recent(messages: readonly unknown[], room: number): unknown[] {
  let start = Math.max(0, messages.length - room)
  while (start < messages.length && (messages[start] as { role?: string }).role !== 'user')
    start += 1
  return messages.slice(start)
}

async function askWorkspace({ ask, memory, page, push, signal }: AbilityRun) {
  const messages = [
    ...recent(memory.current, MAX_ASSISTANT_MESSAGES - 1),
    { content: ask, role: 'user' },
  ]
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
