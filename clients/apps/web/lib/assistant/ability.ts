import type { PageContext } from './page-context'

/** Characters one message to the assistant may have. */
export const ASSISTANT_ASK_MAX = 2_000

/** Most suggested asks the bar shows. */
export const ASSISTANT_SUGGESTIONS_MAX = 4

/**
 * The assistant bar's plug-in point. A page registers what the assistant can
 * do there as an ability (`useAssistantAbility`); the bar answers with the
 * highest-priority one, and the workspace assistant (priority 0) answers
 * everywhere else. Adding value to a page is registering an ability, not
 * building another chat box.
 */

/** One line of the bar's conversation. */
export type AssistantEntry =
  | { kind: 'user' | 'assistant' | 'change' | 'error' | 'note'; text: string }
  | { kind: 'link'; text: string; href: string }

/** What an ability's run gets. */
export type AbilityRun = {
  ask: string
  page: PageContext
  /** Aborts when the person stops the run, the page closes, or the ability goes. */
  signal: AbortSignal
  push: (entry: AssistantEntry) => void
  /** Kept between turns of one conversation with this ability; cleared by New chat. */
  memory: { current: unknown[] }
}

/** Something the assistant can do on the page it is registered from. */
export type AssistantAbility = {
  /** Stable for one target: a new id starts a new conversation. */
  id: string
  /** What the assistant acts on, shown beside the input ("Artboard 2 · Hero"). */
  label: string
  placeholder: string
  /**
   * Asks worth one click here, shown while the conversation is empty, so the
   * first value is a click away. Only asks this ability can carry out.
   */
  suggestions?: readonly string[]
  /** The highest registered priority answers; the workspace assistant is 0. */
  priority: number
  /** Open the bar on arrival, as where this ability is the page's main tool. */
  prominent?: boolean
  /** Do the work, reporting through `push`. A throw is shown as the run's error. */
  run: (run: AbilityRun) => Promise<void>
}
