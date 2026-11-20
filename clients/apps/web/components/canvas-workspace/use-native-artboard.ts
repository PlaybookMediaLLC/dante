'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeDocumentBridge } from '@/lib/creative-sets/native-session'
import type { CanvasSession } from '@/lib/canvas/session'

/**
 * Mount one artboard in the native editor and keep it in step with the
 * canvas document. The editor reloads only when that artboard's document
 * changed from outside the editor (undo, a template, a brand kit, a
 * collaborator), never because another artboard moved. Switching
 * artboards flushes the open one first, so one artboard's editor state is
 * never written into another.
 */
export function useNativeArtboard(
  session: CanvasSession,
  activeId: string | null,
  enabled: boolean,
  loadEpoch: number
) {
  const bridge = useRef<NativeDocumentBridge | null>(null)
  const loaded = useRef<string | null>(null)
  const pending = useRef<Promise<void>>(Promise.resolve())
  // Which artboard is loaded or failed, not just whether: on the render that switches
  // artboards, the previous one's state must not read as the new one's.
  const [readyId, setReadyId] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  const [reload, setReload] = useState(0)

  const activeJson = useCallback(() => {
    const artboard = session.snapshot().document.artboards.find((item) => item.id === activeId)
    return artboard ? JSON.stringify(artboard.document) : null
  }, [session, activeId])

  /** Load the artboard into the open editor in place if it changed outside the editor. */
  const sync = useCallback(() => {
    const instance = bridge.current
    if (!instance) return pending.current
    const json = activeJson()
    if (json === loaded.current) return pending.current
    loaded.current = json
    pending.current = instance.replace().catch(() => setReload((value) => value + 1))
    return pending.current
  }, [activeJson])

  // A load epoch means the document changed outside the editor.
  useEffect(() => {
    void sync()
  }, [loadEpoch, sync])

  useEffect(() => {
    if (!enabled || !activeId) {
      setReadyId(null)
      return
    }
    if (!session.snapshot().document.artboards.some((item) => item.id === activeId)) return
    const instance = session.nativeBridge(activeId, (document) => {
      loaded.current = JSON.stringify(document)
    })
    bridge.current = instance
    loaded.current = activeJson()
    setReadyId(null)
    setFailed(null)
    instance.open().then(
      () => {
        if (bridge.current === instance) setReadyId(activeId)
      },
      (failure: unknown) => {
        if (bridge.current === instance)
          setFailed({
            id: activeId,
            message:
              failure instanceof Error ? failure.message : 'This artboard could not be opened.',
          })
      }
    )
    return () => {
      instance.close()
      if (bridge.current === instance) bridge.current = null
    }
  }, [session, activeId, enabled, reload, activeJson])

  /** Commit the open artboard's pending edit now. Throws when the edit cannot be stored. */
  const flush = useCallback(() => {
    bridge.current?.flush()
  }, [])

  return {
    ready: Boolean(activeId) && readyId === activeId,
    error: failed && failed.id === activeId ? failed.message : null,
    flush,
    sync,
  }
}
