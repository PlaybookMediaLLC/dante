'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { SparkleIcon } from '@phosphor-icons/react/dist/ssr/Sparkle'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowUp'
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCopilotAvailable } from '@/components/editor-ai/useCopilotAvailable'
import { useEditorCopilot } from '@/components/editor-ai/useEditorCopilot'
import type { Artboard } from '@/lib/canvas/document'
import { artboardRect } from '@/lib/canvas/document'
import { readingOrder } from '@/lib/canvas/layout'
import { useCanvasUi } from '@/lib/canvas/ui-store'
import { EDITOR_ASK_MAX } from '@/lib/ai/editor-ask'
import { cn } from '@/lib/utils'

/**
 * The canvas's chat dock: the screenshot editor's copilot, pointed at one
 * artboard. An artboard opens in the editor while it is open for editing,
 * and the canvas saves what the editor changes, so the copilot edits the
 * open artboard, or opens the selected (else the first) one before it asks.
 * Shown only where the workspace has the copilot and the member may edit.
 */
export function CanvasCopilotDock({
  artboards,
  activeId,
  ready,
  error,
  onEdit,
}: {
  artboards: Artboard[]
  activeId: string | null
  /** The open artboard is loaded in the editor and its changes are saved. */
  ready: boolean
  /** Why the open artboard could not load in the editor. */
  error: string | null
  onEdit: (id: string) => void
}) {
  const available = useCopilotAvailable()
  const selection = useCanvasUi((ui) => ui.selection)
  // The editor's own history is not the artboard's here: ⌘Z on the canvas undoes.
  const { entries, isRunning, reset, send } = useEditorCopilot(undefined, { canUndo: false })
  const [text, setText] = useState('')
  /** A request waiting for its artboard to open; `opened` once that artboard became the open one. */
  const [queued, setQueued] = useState<{ ask: string; id: string; opened: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** The running request and the artboard it edits. */
  const run = useRef<{ controller: AbortController; id: string } | null>(null)
  const [open, setOpen] = useState(true)
  const transcript = useRef<HTMLOListElement>(null)

  const order = readingOrder(artboards.map((item) => ({ id: item.id, rect: artboardRect(item) })))
  const targetId =
    activeId ?? selection.find((id) => artboards.some((item) => item.id === id)) ?? order[0]?.id
  const target = artboards.find((item) => item.id === targetId)
  const number = order.findIndex((item) => item.id === targetId) + 1

  const start = useCallback(
    (ask: string, id: string) => {
      const controller = new AbortController()
      run.current = { controller, id }
      void send(ask, null, controller.signal).finally(() => {
        if (run.current?.controller === controller) run.current = null
      })
    },
    [send]
  )

  // A request waits for its own artboard to open, so it never edits another one.
  useEffect(() => {
    if (!queued) return
    const fail = (message: string) => {
      setQueued(null)
      setNotice(message)
    }
    if (activeId === queued.id) {
      if (error) fail(`The artboard could not open: ${error}`)
      else if (ready) {
        setQueued(null)
        start(queued.ask, queued.id)
      } else if (!queued.opened) setQueued({ ...queued, opened: true })
    } else if (activeId || queued.opened) {
      fail('The artboard closed before the copilot could start. Ask again.')
    }
  }, [queued, activeId, ready, error, start])

  // A run stops when its artboard stops being the open one, or the canvas closes.
  useEffect(() => {
    if (run.current && run.current.id !== activeId)
      run.current.controller.abort(new Error('Stopped: the artboard was closed.'))
  }, [activeId])
  useEffect(() => () => run.current?.controller.abort(new Error('Stopped.')), [])

  // Another artboard starts its own conversation.
  const lastTarget = useRef(targetId)
  useEffect(() => {
    if (lastTarget.current === targetId) return
    lastTarget.current = targetId
    if (!run.current && !queued) {
      reset()
      setNotice(null)
    }
  }, [targetId, queued, reset])

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight })
  }, [entries])

  if (!available || !target) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const ask = text.trim().slice(0, EDITOR_ASK_MAX)
    if (!ask || isRunning || queued) return
    setText('')
    setOpen(true)
    setNotice(null)
    if (activeId === target.id && ready) start(ask, target.id)
    else {
      setQueued({ ask, id: target.id, opened: activeId === target.id })
      if (activeId !== target.id) onEdit(target.id)
    }
  }

  const busy = isRunning || queued !== null
  return (
    <section aria-label="Canvas copilot" className="canvas-copilot" data-board-control>
      {(entries.length || notice) && open ? (
        <div className="canvas-copilot-thread">
          <header className="flex items-center gap-2 border-b px-3 py-2 text-[12.5px]">
            <span className="font-medium">Copilot</span>
            <span className="truncate text-muted-foreground">
              {number ? `${number} · ` : ''}
              {target.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-auto h-7 rounded-full px-2.5 text-xs"
              disabled={busy}
              onClick={() => {
                reset()
                setNotice(null)
              }}
            >
              New chat
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Hide the conversation"
              className="size-7 rounded-full p-0"
              onClick={() => setOpen(false)}
            >
              <MinusIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </header>
          <ol
            ref={transcript}
            aria-live="polite"
            className="grid max-h-[32vh] gap-2 overflow-y-auto p-3"
          >
            {entries.map((entry, index) => (
              <li
                key={index}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed',
                  entry.kind === 'user' && 'justify-self-end bg-foreground text-background',
                  entry.kind === 'assistant' && 'bg-foreground/[0.05]',
                  entry.kind === 'change' && 'px-0 py-0 text-xs text-muted-foreground',
                  entry.kind === 'error' && 'bg-destructive/10 text-destructive'
                )}
              >
                {entry.kind === 'change' ? `✓ ${entry.summary}` : entry.text}
              </li>
            ))}
            {notice ? (
              <li
                role="alert"
                className="rounded-2xl bg-destructive/10 px-3 py-1.5 text-[13px] text-destructive"
              >
                {notice}
              </li>
            ) : null}
            {busy ? (
              <li role="status" className="text-xs text-muted-foreground">
                {queued ? 'Opening the artboard…' : 'Working…'}
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}
      <form onSubmit={submit} className="canvas-copilot-bar">
        <SparkleIcon aria-hidden="true" className="size-4 shrink-0 text-violet-500" />
        <Input
          aria-label="Ask the copilot to change this artboard"
          placeholder={`Ask AI to change ${number ? `artboard ${number}` : 'this artboard'}`}
          value={text}
          maxLength={EDITOR_ASK_MAX}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setOpen(true)}
        />
        <Button
          type="submit"
          size={null}
          variant="custom"
          aria-label="Send to the copilot"
          disabled={!text.trim() || busy}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
        >
          <ArrowUpIcon className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </section>
  )
}
