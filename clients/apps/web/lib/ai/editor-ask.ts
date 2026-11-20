/**
 * Create's prompt bar hands a request to the editor's copilot as `?ask=`.
 * Short enough that a URL-encoded request in any script stays far under
 * the server's header limit.
 */
export const EDITOR_ASK_PARAM = 'ask'
export const EDITOR_ASK_MAX = 500
