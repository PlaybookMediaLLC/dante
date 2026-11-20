/**
 * A request handed to the AI where a page opens, as `?ask=`: the screenshot
 * editor's copilot reads it, and so does the assistant bar on any page with
 * one (the canvas), each holding it ready to send. Short enough that a
 * URL-encoded request in any script stays far under the server's header limit.
 */
export const EDITOR_ASK_PARAM = 'ask'
export const EDITOR_ASK_MAX = 500

/** A new screenshot whose editor copilot holds `ask`, ready to send. */
export function editorAskHref(ask: string): string {
  return withAsk('/editor?start=new', ask)
}

/** `href` (an address inside the app) opening with the AI holding `ask`, ready to send. */
export function withAsk(href: string, ask: string): string {
  const url = new URL(href, 'http://shots.local')
  url.searchParams.set(EDITOR_ASK_PARAM, ask.slice(0, EDITOR_ASK_MAX))
  return `${url.pathname}${url.search}`
}
