'use client'

import { MAX_ASSISTANT_MESSAGES, workspaceAssistantResponseSchema } from '@/lib/api/contracts/ai'
import type { AbilityRun, AssistantAbility } from '@/lib/assistant/ability'
import { internalHref } from '@/lib/assistant/page-context'
import type { PlatformArea } from '@/lib/platform/navigation'

/**
 * The ability every page has: the workspace assistant, answering from the
 * page the person is on with lookups, links to open, and buttons that start
 * new work already filled in.
 */
const WORKSPACE_ABILITY_ID = 'workspace'

/**
 * One-click asks per area, each one the assistant's tools can answer. `make`
 * asks start work (startWork needs `artifact:edit`); `paid` ones (canvases)
 * also need a paid plan, and `post` ones (draftPost) the workspace's posts;
 * `see-posts` asks only read posts, so any member with posts gets them.
 */
type Suggestion = { ask: string; needs?: 'make' | 'paid' | 'post' | 'see-posts' }
const SUGGESTIONS: Partial<Record<PlatformArea, readonly Suggestion[]>> = {
  home: [
    { ask: 'What needs my attention?' },
    { ask: 'Make a launch visual for our newest feature', needs: 'make' },
    { ask: 'Start a product launch canvas', needs: 'paid' },
    { ask: 'Draft a post about our latest release', needs: 'post' },
  ],
  create: [
    { ask: 'Make a dark hero shot for a new feature', needs: 'make' },
    { ask: 'Which canvas fits a release announcement?' },
    { ask: 'Start a feature walkthrough canvas', needs: 'paid' },
  ],
  campaigns: [
    { ask: 'Which campaigns are still drafts?' },
    { ask: 'Start a campaign for our latest release', needs: 'make' },
    { ask: 'What do you know about our product?' },
  ],
  publish: [
    { ask: 'Draft a post about our latest release', needs: 'post' },
    { ask: "What's scheduled this week?", needs: 'see-posts' },
    { ask: 'Did any post fail to publish lately?', needs: 'see-posts' },
  ],
  library: [
    { ask: 'Find my latest canvas' },
    { ask: 'Change the headline on my latest canvas', needs: 'make' },
    { ask: 'Make a launch visual for our newest feature', needs: 'make' },
  ],
  automate: [
    { ask: 'Where do I connect GitHub?' },
    { ask: 'What can I automate when a release ships?' },
  ],
  activity: [
    { ask: 'What needs my attention?' },
    { ask: 'What went out this week?', needs: 'see-posts' },
  ],
  settings: [{ ask: 'Where do I change brand colours?' }, { ask: 'Where do I invite a teammate?' }],
}
const DEFAULT_SUGGESTIONS: readonly Suggestion[] = [
  { ask: 'What can you help with here?' },
  { ask: 'Find my latest work' },
]

/** What the member may start here, which decides the asks worth offering. */
export type WorkspaceAllowance = {
  canEdit: boolean
  paidPlan: boolean
  /** Posts are on, and on the workspace's plan. */
  posts: boolean
}

/** The area's one-click asks this member can carry out. */
export function workspaceSuggestions(
  area: PlatformArea | undefined,
  { canEdit, paidPlan, posts }: WorkspaceAllowance
): string[] {
  const can = {
    make: canEdit,
    paid: canEdit && paidPlan,
    post: canEdit && posts,
    'see-posts': posts,
  }
  return ((area && SUGGESTIONS[area]) || DEFAULT_SUGGESTIONS)
    .filter((item) => !item.needs || can[item.needs])
    .map((item) => item.ask)
}

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
  for (const post of reply.posts) push({ kind: 'post', text: post.text })
  for (const link of reply.links) {
    const href = internalHref(link.href)
    if (href) push({ href, kind: 'link', text: link.label })
  }
}

/** The workspace assistant, labelled with the page it is asked from. */
export function workspaceAbility(
  pageTitle: string,
  area: PlatformArea | undefined,
  allowance: WorkspaceAllowance
): AssistantAbility {
  return {
    id: WORKSPACE_ABILITY_ID,
    label: pageTitle || 'Workspace',
    placeholder: 'Ask, find, or start something new',
    priority: 0,
    run: askWorkspace,
    suggestions: workspaceSuggestions(area, allowance),
  }
}
