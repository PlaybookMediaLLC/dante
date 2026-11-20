/**
 * The canvas copilot opens an artboard before it edits it. While a request
 * waits for that artboard to load in the editor, this decides each time the
 * editor's state changes: keep waiting, start, or give up. Pure, so it is
 * tested on its own.
 */

/** The editor's state as the waiting request sees it. */
export type EditorOpenState = {
  /** The artboard open for editing, if any. */
  activeId: string | null
  /** The open artboard is loaded and its changes are saved. */
  ready: boolean
  /** Why the open artboard could not load. */
  error: string | null
  /** The canvas is still on screen. */
  mounted: boolean
}

/** What the waiting request does next. */
export type WaitStep =
  { kind: 'wait'; seen: boolean } | { kind: 'start' } | { kind: 'fail'; message: string }

/**
 * The next step for a request waiting on artboard `id`. `seen` is whether that
 * artboard was the open one at some point, so closing it ends the wait.
 * `from` is the artboard open when the wait began (a run moving across the
 * canvas): it may stay open until the editor switches, so it is not a
 * failure until `id` has been seen.
 */
export function waitForArtboard(
  state: EditorOpenState,
  id: string,
  seen: boolean,
  from: string | null = null
): WaitStep {
  if (!state.mounted) return { kind: 'fail', message: 'Stopped: the canvas was closed.' }
  if (state.activeId === id) {
    if (state.error) return { kind: 'fail', message: `The artboard could not open: ${state.error}` }
    return state.ready ? { kind: 'start' } : { kind: 'wait', seen: true }
  }
  if (!seen && state.activeId && state.activeId === from) return { kind: 'wait', seen }
  if (state.activeId || seen)
    return {
      kind: 'fail',
      message: 'The artboard closed before the copilot could start. Ask again.',
    }
  return { kind: 'wait', seen }
}

/**
 * A request about the whole canvas: "every artboard", "all the slides", "each
 * of my pages", "both artboards", "across the canvas". The word must govern
 * the noun, so "all the text on this slide" stays on one artboard.
 */
export const ACROSS_ARTBOARDS =
  /\b(?:(?:all|every|each)(?:\s+of)?(?:\s+(?:the|my|our|these|those))?(?:\s+\w+)?|both)\s+(?:artboards?|slides?|pages?|frames?)\b|\bacross\s+the\s+(?:canvas|deck)\b/i

/** Most artboards one canvas-wide request runs on, so a misread request cannot drain credits. */
export const ACROSS_ARTBOARDS_MAX = 12
