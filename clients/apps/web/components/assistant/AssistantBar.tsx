'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useSearchParams } from 'next/navigation'
import { create } from 'zustand'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowUp'
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus'
import { StopIcon } from '@phosphor-icons/react/dist/ssr/Stop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarLink } from '@/components/platform-shell/SidebarLink'
import { useKeys } from '@/components/write/shortcuts'
import { EDITOR_ASK_MAX, EDITOR_ASK_PARAM } from '@/lib/ai/editor-ask'
import { useAiAvailable } from './useAiAvailable'
import {
  ASSISTANT_ASK_MAX,
  type AssistantAbility,
  type AssistantEntry,
} from '@/lib/assistant/ability'
import type { PageContext } from '@/lib/assistant/page-context'
import { platformArea } from '@/lib/platform/navigation'
import { withoutLocale } from '@/lib/settings/appearance'
import { cn } from '@/lib/utils'
import { AssistantMark } from './AssistantMark'
import { AssistantPost } from './AssistantPost'
import { useAssistantRegistry } from './AssistantProvider'
import { workspaceAbility } from './workspace-ability'

/**
 * The conversation, kept outside the page so it carries on across pages
 * while the same ability answers (the workspace assistant on every page).
 */
const useConversation = create<{
  abilityId: string | null
  entries: AssistantEntry[]
  memory: { current: unknown[] }
  controller: AbortController | null
  /** Whether the bar is open, kept across pages with the conversation. */
  open: boolean
  /** Bumped when the launcher asks for the cursor in the bar. */
  focus: number
}>(() => ({
  abilityId: null,
  entries: [],
  memory: { current: [] },
  controller: null,
  open: false,
  focus: 0,
}))

const setOpen = (open: boolean) => useConversation.setState({ open })

/** Most suggested asks the bar shows. */
const SUGGESTIONS_MAX = 4

/** Open the bar with the cursor in it. */
const openWithFocus = () =>
  useConversation.setState((state) => ({ open: true, focus: state.focus + 1 }))

const push = (entry: AssistantEntry) =>
  useConversation.setState((state) => ({ entries: [...state.entries, entry] }))

const startOver = (abilityId: string | null) =>
  useConversation.setState({ abilityId, entries: [], memory: { current: [] } })

/** The tab's title without the product name, as the page's name. */
function pageTitle(): string {
  return document.title.replace(/\s*[|·–-]\s*Shots\s*$/, '').trim()
}

/**
 * The AI chat bar on every page under the shell. It always sends the page it
 * is on (address, title, area, and what the page registered) and answers
 * with the page's highest-priority ability, else the workspace assistant.
 * Shown where the workspace has AI.
 */
export function AssistantBar({
  canEdit,
  paidPlan,
  posts,
}: {
  /** The member may make work, so the bar offers asks that start some. */
  canEdit: boolean
  paidPlan: boolean
  /** Posts are on, and on the workspace's plan. */
  posts: boolean
}) {
  const registry = useAssistantRegistry()
  const available = useAiAvailable()
  const path = withoutLocale(usePathname())
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const entries = useConversation((state) => state.entries)
  const open = useConversation((state) => state.open)
  const running = useConversation((state) => state.controller !== null)
  const conversationAbility = useConversation((state) => state.abilityId)
  const thread = useRef<HTMLOListElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Next sets the title after navigating; follow it.
  useEffect(() => {
    setTitle(pageTitle())
    const head = document.querySelector('title')
    if (!head) return
    const observer = new MutationObserver(() => setTitle(pageTitle()))
    observer.observe(head, { childList: true })
    return () => observer.disconnect()
  }, [path])

  const area = platformArea(path)
  const registered = [...(registry?.abilities.values() ?? [])]
  const ability: AssistantAbility = registered.reduce<AssistantAbility>(
    (best, item) => (item.priority > best.priority ? item : best),
    workspaceAbility(title, area, { canEdit, paidPlan, posts })
  )

  // A different ability starts its own conversation (a running one finishes first), with
  // the bar open where it is the page's main tool and closed elsewhere.
  const prominent = ability.prominent === true
  useEffect(() => {
    if (conversationAbility === ability.id || running) return
    startOver(ability.id)
    setOpen(prominent)
  }, [ability.id, conversationAbility, prominent, running])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [entries])

  // The launcher puts the cursor in the bar once it has opened.
  const focus = useConversation((state) => state.focus)
  useEffect(() => {
    if (focus) input.current?.focus()
  }, [focus, open])

  // ⌘J (Ctrl+J) opens the bar from anywhere; a closer Ask AI, as in the post composer, wins.
  const shown = Boolean(registry?.slot && available)
  useEffect(() => {
    if (!shown) return
    const onKey = (event: KeyboardEvent) => {
      // `code` too, so the shortcut holds on non-Latin keyboard layouts.
      if (event.defaultPrevented || (event.key.toLowerCase() !== 'j' && event.code !== 'KeyJ'))
        return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      // A rich-text editor (the post composer, Plate) keeps ⌘J for its own Ask AI.
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return
      event.preventDefault()
      openWithFocus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])

  // `?ask=` opens the bar holding a request, as "Edit with AI" links do; dropped once read,
  // so a reload asks nothing. The screenshot editor (no bar) reads it in its own panel.
  const ask = useSearchParams().get(EDITOR_ASK_PARAM)?.trim().slice(0, EDITOR_ASK_MAX) ?? ''
  const asked = useRef('')
  useEffect(() => {
    // Once the address no longer holds it, the same request may arrive again.
    if (!ask) asked.current = ''
    if (!shown || !ask || asked.current === ask) return
    asked.current = ask
    setText(ask)
    openWithFocus()
    const url = new URL(window.location.href)
    url.searchParams.delete(EDITOR_ASK_PARAM)
    window.history.replaceState(null, '', url)
  }, [ask, shown])

  if (!registry || !available || !registry.slot) return null

  // Within the contract's limits, so a long name or fact never fails the turn.
  const clip = (value: string, max: number) => value.slice(0, max)
  const page = (): PageContext => {
    const parts = [...registry.parts.values()]
    return {
      area: clip(area ?? path.split('/')[1] ?? 'home', 40),
      entities: parts
        .flatMap((part) => part.entities ?? [])
        .slice(0, 8)
        .map((entity) => ({
          id: clip(entity.id, 80),
          type: clip(entity.type, 40),
          ...(entity.name ? { name: clip(entity.name, 200) } : {}),
        })),
      facts: parts
        .flatMap((part) => part.facts ?? [])
        .slice(0, 12)
        .map((fact) => clip(fact, 300)),
      path: clip(path, 300),
      title: clip(pageTitle() || title, 200),
    }
  }

  const send = async (value: string) => {
    const ask = value.trim().slice(0, ASSISTANT_ASK_MAX)
    if (!ask || running) return
    if (conversationAbility !== ability.id) startOver(ability.id)
    const controller = new AbortController()
    useConversation.setState({ controller })
    push({ kind: 'user', text: ask })
    try {
      await ability.run({
        ask,
        memory: useConversation.getState().memory,
        page: page(),
        push,
        signal: controller.signal,
      })
    } catch (error) {
      push({
        kind: 'error',
        text: controller.signal.aborted
          ? 'Stopped.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong.',
      })
    } finally {
      useConversation.setState({ controller: null })
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || running) return
    setText('')
    void send(text)
  }
  const suggestions = entries.length ? [] : (ability.suggestions ?? []).slice(0, SUGGESTIONS_MAX)

  const bar = open ? (
    <section aria-label="Assistant" className="assistant" data-board-control>
      {entries.length ? (
        <div className="assistant-thread">
          <header className="flex items-center gap-2 border-b px-3 py-2 text-[0.78125rem]">
            <span className="font-medium">Shots</span>
            <span className="truncate text-muted-foreground">{ability.label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-auto h-7 rounded-full px-2.5 text-xs"
              disabled={running}
              onClick={() => startOver(ability.id)}
            >
              New chat
            </Button>
          </header>
          <ol
            ref={thread}
            aria-live="polite"
            className="grid max-h-[34vh] gap-2 overflow-y-auto p-3"
          >
            {entries.map((entry, index) => (
              <li
                key={index}
                className={cn(
                  'max-w-[85%] text-[0.8125rem] leading-relaxed',
                  entry.kind === 'post' && 'w-full',
                  entry.kind === 'user' &&
                    'justify-self-end rounded-2xl bg-foreground px-3 py-1.5 text-background',
                  entry.kind === 'assistant' && 'rounded-2xl bg-foreground/[0.05] px-3 py-1.5',
                  (entry.kind === 'change' || entry.kind === 'note') &&
                    'text-xs text-muted-foreground',
                  entry.kind === 'error' &&
                    'rounded-2xl bg-destructive/10 px-3 py-1.5 text-destructive'
                )}
              >
                {entry.kind === 'link' ? (
                  <SidebarLink
                    href={entry.href}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium hover:bg-foreground/[0.04]"
                  >
                    {entry.text} →
                  </SidebarLink>
                ) : entry.kind === 'post' ? (
                  <AssistantPost text={entry.text} />
                ) : entry.kind === 'change' ? (
                  `✓ ${entry.text}`
                ) : (
                  entry.text
                )}
              </li>
            ))}
            {running ? (
              <li role="status" className="text-xs text-muted-foreground">
                Working…
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}
      {suggestions.length ? (
        <div role="group" aria-label="Suggestions" className="assistant-suggestions">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="custom"
              size={null}
              className="assistant-suggestion"
              disabled={running}
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}
      <form onSubmit={submit} className="assistant-bar">
        <AssistantMark className="-mx-px shrink-0" />
        <span className="assistant-context" title={`The assistant sees: ${ability.label}`}>
          {ability.label}
        </span>
        <Input
          ref={input}
          aria-label="Ask the assistant"
          placeholder={ability.placeholder}
          value={text}
          maxLength={ASSISTANT_ASK_MAX}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !prominent && !running) setOpen(false)
          }}
        />
        {running ? (
          <Button
            type="button"
            size={null}
            variant="custom"
            aria-label="Stop"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background"
            onClick={() => useConversation.getState().controller?.abort()}
          >
            <StopIcon className="size-3.5" aria-hidden="true" weight="fill" />
          </Button>
        ) : (
          <Button
            type="submit"
            size={null}
            variant="custom"
            aria-label="Send"
            disabled={!text.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
          >
            <ArrowUpIcon className="size-4" aria-hidden="true" />
          </Button>
        )}
        {prominent ? null : (
          <Button
            type="button"
            size={null}
            variant="custom"
            aria-label="Hide the assistant"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <MinusIcon className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </form>
    </section>
  ) : null
  return bar ? createPortal(bar, registry.slot) : null
}

/**
 * "Ask AI" in the sidebar: opens the bar over the page and puts the cursor in
 * it. It lives in the navigation so a closed bar never covers the page.
 */
export function AssistantLauncher({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  /** Closes the phone menu the launcher sits in. */
  onNavigate?: () => void
}) {
  const registry = useAssistantRegistry()
  const available = useAiAvailable()
  const open = useConversation((state) => state.open)
  const keys = useKeys()
  if (!registry?.slot || !available) return null
  return (
    <Button
      type="button"
      variant="custom"
      size={null}
      aria-label="Open the assistant"
      aria-expanded={open}
      title={`Ask AI about this page or your workspace (${keys.label({ key: 'j', mod: true })})`}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[0.84375rem] text-foreground/85 transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
        collapsed && 'mx-auto size-10 justify-center px-0'
      )}
      onClick={() => {
        onNavigate?.()
        openWithFocus()
      }}
    >
      <AssistantMark className="-mx-px shrink-0" />
      {collapsed ? null : 'Ask AI'}
    </Button>
  )
}
