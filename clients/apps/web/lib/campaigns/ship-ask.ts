/**
 * The campaigns list's "What did you ship?" box takes its sentence from
 * `?ship=`, so the assistant can open it filled in. The person still sends.
 */
export const CAMPAIGN_SHIP_PARAM = 'ship'
export const CAMPAIGN_SHIP_MAX = 500

/** The campaigns list with "What did you ship?" holding `shipped`. */
export function campaignShipHref(shipped: string): string {
  return `/campaigns?${new URLSearchParams({ [CAMPAIGN_SHIP_PARAM]: shipped.slice(0, CAMPAIGN_SHIP_MAX) })}`
}
