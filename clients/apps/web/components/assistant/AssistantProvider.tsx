'use client'

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AbilityRun, AssistantAbility } from '@/lib/assistant/ability'
import type { PageEntity } from '@/lib/assistant/page-context'

/** What a page adds to the address and title the bar already knows. */
export type PageContextPart = { facts?: string[]; entities?: PageEntity[] }

type Registry = {
  abilities: ReadonlyMap<string, AssistantAbility>
  parts: ReadonlyMap<string, PageContextPart>
  slot: HTMLElement | null
  setAbility: (key: string, ability: AssistantAbility | null) => void
  setPart: (key: string, part: PageContextPart | null) => void
  setSlot: (key: string, slot: { element: HTMLElement; fallback: boolean } | null) => void
}

const AssistantRegistry = createContext<Registry | null>(null)

function withEntry<T>(map: ReadonlyMap<string, T>, key: string, value: T | null) {
  const next = new Map(map)
  if (value === null) next.delete(key)
  else next.set(key, value)
  return next
}

/**
 * Holds what every page tells the assistant: facts and open items, the
 * abilities it offers, and where the bar sits. The shell provides it, so any
 * page under the shell can register; outside it the hooks do nothing.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [abilities, setAbilities] = useState<ReadonlyMap<string, AssistantAbility>>(new Map())
  const [parts, setParts] = useState<ReadonlyMap<string, PageContextPart>>(new Map())
  const [slots, setSlots] = useState<
    ReadonlyMap<string, { element: HTMLElement; fallback: boolean }>
  >(new Map())
  const registry = useMemo<Registry>(
    () => ({
      abilities,
      parts,
      // A page's own slot beats the shell's fallback; among pages, the latest.
      slot:
        [...slots.values()].findLast((item) => !item.fallback)?.element ??
        [...slots.values()].at(-1)?.element ??
        null,
      setAbility: (key, ability) => setAbilities((map) => withEntry(map, key, ability)),
      setPart: (key, part) => setParts((map) => withEntry(map, key, part)),
      setSlot: (key, slot) => setSlots((map) => withEntry(map, key, slot)),
    }),
    [abilities, parts, slots]
  )
  return <AssistantRegistry value={registry}>{children}</AssistantRegistry>
}

/** The registry, for the bar. */
export function useAssistantRegistry(): Registry | null {
  return useContext(AssistantRegistry)
}

/**
 * Tell the assistant what this page shows: short facts and the items open
 * on it. Kept while the calling component is mounted.
 */
export function useAssistantPage(part: PageContextPart) {
  const registry = useContext(AssistantRegistry)
  const key = useId()
  const setPart = registry?.setPart
  const json = JSON.stringify(part)
  useEffect(() => {
    if (!setPart) return
    setPart(key, JSON.parse(json) as PageContextPart)
    return () => setPart(key, null)
  }, [setPart, key, json])
}

/** {@link useAssistantPage} for server pages: renders nothing. */
export function AssistantPageContext(part: PageContextPart) {
  useAssistantPage(part)
  return null
}

/**
 * Offer an ability on this page while the calling component is mounted; null
 * offers none. Only its description re-registers; `run` always calls the
 * latest one, so it may close over fresh state.
 */
export function useAssistantAbility(ability: AssistantAbility | null) {
  const registry = useContext(AssistantRegistry)
  const key = useId()
  const latest = useRef(ability)
  useEffect(() => {
    latest.current = ability
  })
  const setAbility = registry?.setAbility
  const description = ability
    ? JSON.stringify([
        ability.id,
        ability.label,
        ability.placeholder,
        ability.priority,
        ability.prominent ?? false,
      ])
    : null
  useEffect(() => {
    if (!setAbility || !description) return
    const [id, label, placeholder, priority, prominent] = JSON.parse(description) as [
      string,
      string,
      string,
      number,
      boolean,
    ]
    setAbility(key, {
      id,
      label,
      placeholder,
      priority,
      prominent,
      run: (run: AbilityRun) => {
        if (!latest.current) throw new Error('This is no longer available here.')
        return latest.current.run(run)
      },
    })
    return () => setAbility(key, null)
  }, [setAbility, key, description])
}

/**
 * Where the bar sits. The shell places a `fallback` slot over the page; a
 * page places its own to move the bar, as the canvas does over its board.
 * Fills its positioned parent.
 */
export function AssistantSlot({
  fallback = false,
  placement = 'center',
}: {
  fallback?: boolean
  /** Centred at the foot, or at the foot's end beside the page's own controls. */
  placement?: 'center' | 'end'
}) {
  const registry = useContext(AssistantRegistry)
  const key = useId()
  const setSlot = registry?.setSlot
  const [element, setElement] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!setSlot || !element) return
    setSlot(key, { element, fallback })
    return () => setSlot(key, null)
  }, [setSlot, key, element, fallback])
  return (
    <div
      ref={setElement}
      data-assistant-slot
      data-placement={placement}
      className="assistant-slot"
    />
  )
}
