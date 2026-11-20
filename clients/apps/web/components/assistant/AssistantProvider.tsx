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

/** Where the bar renders, and whether it is the shell's fallback. */
type Slot = { element: HTMLElement; fallback: boolean }

/** What registered: read by the bar. */
type RegistryState = {
  abilities: ReadonlyMap<string, AssistantAbility>
  parts: ReadonlyMap<string, PageContextPart>
  slot: HTMLElement | null
}

/** How pages register: stable for the provider's life, so registering re-renders no one. */
type RegistryActions = {
  setAbility: (key: string, ability: AssistantAbility | null) => void
  setPart: (key: string, part: PageContextPart | null) => void
  setSlot: (key: string, slot: Slot | null) => void
}

const State = createContext<RegistryState | null>(null)
const Actions = createContext<RegistryActions | null>(null)

/** The map with `key` set or removed; the same map when nothing changes. */
function withEntry<T>(map: ReadonlyMap<string, T>, key: string, value: T | null) {
  if (value === null ? !map.has(key) : map.get(key) === value) return map
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
  const [slots, setSlots] = useState<ReadonlyMap<string, Slot>>(new Map())
  const actions = useMemo<RegistryActions>(
    () => ({
      setAbility: (key, ability) => setAbilities((map) => withEntry(map, key, ability)),
      setPart: (key, part) => setParts((map) => withEntry(map, key, part)),
      setSlot: (key, slot) => setSlots((map) => withEntry(map, key, slot)),
    }),
    []
  )
  const state = useMemo<RegistryState>(() => {
    const all = [...slots.values()]
    return {
      abilities,
      parts,
      // A page's own slot beats the shell's fallback; among pages, the latest.
      slot: (all.findLast((item) => !item.fallback) ?? all.at(-1))?.element ?? null,
    }
  }, [abilities, parts, slots])
  return (
    <Actions value={actions}>
      <State value={state}>{children}</State>
    </Actions>
  )
}

/** What registered, for the bar. */
export function useAssistantRegistry(): RegistryState | null {
  return useContext(State)
}

/**
 * Tell the assistant what this page shows: short facts and the items open
 * on it. Kept while the calling component is mounted.
 */
export function useAssistantPage(part: PageContextPart) {
  const setPart = useContext(Actions)?.setPart
  const key = useId()
  // Re-registers only when the content changes, not on every render.
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
  const setAbility = useContext(Actions)?.setAbility
  const key = useId()
  const latest = useRef(ability)
  useEffect(() => {
    latest.current = ability
  })
  const id = ability?.id
  const label = ability?.label ?? ''
  const placeholder = ability?.placeholder ?? ''
  const priority = ability?.priority ?? 0
  const prominent = ability?.prominent ?? false
  // A string, so a fresh array with the same asks does not re-register.
  const suggestions = JSON.stringify(ability?.suggestions ?? [])
  useEffect(() => {
    if (!setAbility || !id) return
    setAbility(key, {
      id,
      label,
      placeholder,
      priority,
      prominent,
      suggestions: JSON.parse(suggestions) as string[],
      run: (run: AbilityRun) => {
        if (!latest.current) throw new Error('This is no longer available here.')
        return latest.current.run(run)
      },
    })
    return () => setAbility(key, null)
  }, [setAbility, key, id, label, placeholder, priority, prominent, suggestions])
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
  const setSlot = useContext(Actions)?.setSlot
  const key = useId()
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
