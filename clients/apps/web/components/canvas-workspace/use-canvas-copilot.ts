'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { ModelMessage } from 'ai'
import { useAssistantAbility, useAssistantPage } from '@/components/assistant/AssistantProvider'
import { runEditorCopilot } from '@/components/editor-ai/useEditorCopilot'
import type { Artboard } from '@/lib/canvas/document'
import { artboardRect } from '@/lib/canvas/document'
import { readingOrder } from '@/lib/canvas/layout'
import { useCanvasUi } from '@/lib/canvas/ui-store'

/**
 * The canvas's assistant ability and page context. The screenshot editor's
 * copilot edits one artboard: the open one, else the selected, else the
 * first. An artboard loads into the editor while open for editing, and the
 * canvas saves what the editor changes (NativeDocumentBridge), so a request
 * opens its artboard first and runs only on it: it stops if that artboard
 * closes, and leaves undo to the canvas's ⌘Z.
 */
export function useCanvasCopilot({
  canvas,
  artboards,
  activeId,
  ready,
  error,
  enabled,
  onEdit,
}: {
  canvas: { id: string; name: string }
  artboards: Artboard[]
  activeId: string | null
  /** The open artboard is loaded in the editor and its changes are saved. */
  ready: boolean
  /** Why the open artboard could not load in the editor. */
  error: string | null
  /** The member may edit here (and is not on a phone). */
  enabled: boolean
  onEdit: (id: string) => void
}) {
  const selection = useCanvasUi((ui) => ui.selection)
  const order = useMemo(
    () => readingOrder(artboards.map((item) => ({ id: item.id, rect: artboardRect(item) }))),
    [artboards]
  )
  const targetId =
    activeId ?? selection.find((id) => artboards.some((item) => item.id === id)) ?? order[0]?.id
  const target = artboards.find((item) => item.id === targetId)
  const number = order.findIndex((item) => item.id === targetId) + 1
  const open = artboards.find((item) => item.id === activeId)

  // The editor's state, for requests waiting on their artboard to open.
  const editor = useRef({ activeId, ready, error })
  const waiters = useRef(new Set<() => void>())
  useEffect(() => {
    editor.current = { activeId, ready, error }
    for (const check of [...waiters.current]) check()
  }, [activeId, ready, error])

  // A run stops when its artboard stops being the open one, or the canvas closes.
  const running = useRef<{ id: string; controller: AbortController } | null>(null)
  useEffect(() => {
    if (running.current && running.current.id !== activeId)
      running.current.controller.abort(new Error('Stopped: the artboard was closed.'))
  }, [activeId])
  useEffect(() => () => running.current?.controller.abort(new Error('Stopped.')), [])

  /** Resolves once artboard `id` is open and loaded; rejects if another opens or it fails. */
  const opened = (id: string, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      let seen = editor.current.activeId === id
      const finish = (settle: () => void) => {
        waiters.current.delete(check)
        signal.removeEventListener('abort', check)
        settle()
      }
      function check() {
        const state = editor.current
        if (signal.aborted) return finish(() => reject(signal.reason))
        if (state.activeId === id) {
          seen = true
          if (state.error)
            finish(() => reject(new Error(`The artboard could not open: ${state.error}`)))
          else if (state.ready) finish(resolve)
        } else if (state.activeId || seen) {
          finish(() =>
            reject(new Error('The artboard closed before the copilot could start. Ask again.'))
          )
        }
      }
      waiters.current.add(check)
      signal.addEventListener('abort', check)
      check()
    })

  useAssistantAbility(
    enabled && target
      ? {
          id: `canvas-artboard:${target.id}`,
          label: `Artboard ${number} · ${target.name}`,
          placeholder: `Ask AI to change artboard ${number}`,
          priority: 10,
          prominent: true,
          run: async ({ ask, memory, push, signal }) => {
            const id = target.id
            if (editor.current.activeId !== id || !editor.current.ready) {
              if (editor.current.activeId !== id) onEdit(id)
              push({ kind: 'note', text: `Opening artboard ${number}…` })
              await opened(id, signal)
            }
            const controller = new AbortController()
            const stop = () => controller.abort(signal.reason)
            signal.addEventListener('abort', stop)
            running.current = { id, controller }
            try {
              await runEditorCopilot({
                canUndo: false,
                memory: memory as { current: ModelMessage[] },
                push: (entry) =>
                  push(entry.kind === 'change' ? { kind: 'change', text: entry.summary } : entry),
                selection: null,
                signal: controller.signal,
                text: ask,
              })
            } finally {
              signal.removeEventListener('abort', stop)
              if (running.current?.controller === controller) running.current = null
            }
          },
        }
      : null
  )

  useAssistantPage({
    entities: [
      { id: canvas.id, name: canvas.name, type: 'canvas' },
      ...(open ? [{ id: open.id, name: open.name, type: 'artboard' }] : []),
    ],
    facts: [
      `A canvas with ${artboards.length} artboard${artboards.length === 1 ? '' : 's'}: ${order
        .slice(0, 8)
        .map((item, index) => {
          const artboard = artboards.find((entry) => entry.id === item.id)
          return `${index + 1} "${artboard?.name ?? ''}" ${Math.round(item.rect.width)}×${Math.round(item.rect.height)}`
        })
        .join(', ')}`,
      open ? `Artboard "${open.name}" is open for editing.` : 'No artboard is open for editing.',
    ],
  })
}
