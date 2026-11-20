'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { create } from 'zustand'
import { SparkleIcon } from '@phosphor-icons/react/dist/ssr/Sparkle'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowUp'
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus'
import { StopIcon } from '@phosphor-icons/react/dist/ssr/Stop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarLink } from '@/components/platform-shell/SidebarLink'
import { useCopilotAvailable } from '@/components/editor-ai/useCopilotAvailable'
import type { AssistantAbility, AssistantEntry } from '@/lib/assistant/ability'
import type { PageContext } from '@/lib/assistant/page-context'
import { EDITOR_ASK_MAX } from '@/lib/ai/editor-ask'
import { platformArea } from '@/lib/platform/navigation'
import { withoutLocale } from '@/lib/settings/appearance'
import { cn } from '@/lib/utils'
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
}>(() => ({ abilityId: null, entries: [], memory: { current: [] }, controller: null, open: false }))

const setOpen = (open: boolean) => useConversation.setState({ open })

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
export function AssistantBar() {
  const registry = useAssistantRegistry()
  const available = useCopilotAvailable()
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

  const registered = [...(registry?.abilities.values() ?? [])]
  const ability: AssistantAbility = registered.reduce<AssistantAbility>(
    (best, item) => (item.priority > best.priority ? item : best),
    workspaceAbility(title)
  )

  // A different ability starts its own conversation (a running one finishes first), with
  // the bar open where it is the page's main tool and closed elsewhere.
  const prominent = ability.prominent === true
  useEffect(() => {
    if (conversationAbility === ability.id || useConversation.getState().controller) return
    startOver(ability.id)
    setOpen(prominent)
  }, [ability.id, conversationAbility, prominent])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [entries])

  if (!registry || !available || !registry.slot) return null

  const page = (): PageContext => {
    const parts = [...registry.parts.values()]
    return {
      area: platformArea(path) ?? path.split('/')[1] ?? 'home',
      entities: parts.flatMap((part) => part.entities ?? []).slice(0, 8),
      facts: parts.flatMap((part) => part.facts ?? []).slice(0, 12),
      path,
      title: pageTitle() || title,
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const ask = text.trim().slice(0, EDITOR_ASK_MAX)
    if (!ask || running) return
    setText('')
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

  const bar = open ? (
    <section aria-label="Assistant" className="assistant" data-board-control>
      {entries.length ? (
        <div className="assistant-thread">
          <header className="flex items-center gap-2 border-b px-3 py-2 text-[12.5px]">
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
                  'max-w-[85%] text-[13px] leading-relaxed',
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
      <form onSubmit={(event) => void submit(event)} className="assistant-bar">
        <SparkleIcon aria-hidden="true" className="size-4 shrink-0 text-violet-500" />
        <span className="assistant-context" title={`The assistant sees: ${ability.label}`}>
          {ability.label}
        </span>
        <Input
          ref={input}
          aria-label="Ask the assistant"
          placeholder={ability.placeholder}
          value={text}
          maxLength={EDITOR_ASK_MAX}
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
  ) : (
    <Button
      type="button"
      variant="custom"
      size={null}
      className="assistant-launcher"
      data-board-control
      onClick={() => {
        setOpen(true)
        requestAnimationFrame(() => input.current?.focus())
      }}
    >
      <SparkleIcon aria-hidden="true" className="size-4 text-violet-500" />
      Ask AI
    </Button>
  )
  return createPortal(bar, registry.slot)
}
