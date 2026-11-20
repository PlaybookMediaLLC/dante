import 'server-only'

import { z } from 'zod'
import { internalHref } from '@/lib/assistant/page-context'
import { defineTool, type ToolRun } from '@/lib/ai/tools/executor'
import { marketingTools } from '@/lib/ai/tools/marketing'
import { marketingServices } from '@/lib/ai/tools/marketing-services'
import { accessAllows } from '@/lib/auth/permissions'
import { contentDraftsEnabled } from '@/lib/content-drafts/flag'
import { PLATFORM_DESTINATIONS } from '@/lib/platform/navigation'
import { listCampaigns } from '@/lib/tenant/campaigns'
import { listCanvases } from '@/lib/tenant/canvases'
import { listContentDrafts } from '@/lib/tenant/content-drafts'
import { listProjects } from '@/lib/tenant/projects'
import { draftHref, draftName } from '@/lib/write/library'
import { palettePages, searchPages } from '@/components/platform-shell/palette-pages'

/**
 * The workspace assistant's tools: read-only looks at the workspace (its
 * work, campaigns, product and brand, and the app's pages) and `offerLink`,
 * which puts a button to a page under the reply. Every tool goes through the
 * RFC 027 executor, so permissions, call caps and timeouts hold and each call
 * is audited. Nothing here changes the workspace; abilities that do change
 * something run where that thing is open (the canvas, the editor).
 */

/** What one turn's tools collect for the reply. */
export type AssistantTurnState = { links: { href: string; label: string }[] }

/** Most links one reply offers. */
const MAX_LINKS = 4

const WORK_KINDS = ['screenshot', 'canvas', 'post'] as const

export function workspaceAssistantTools(run: ToolRun, state: AssistantTurnState) {
  const access = run.access
  const { getBrand, getProduct, listProductSurfaces } = marketingTools(run, {
    services: marketingServices,
  })

  const listRecentWork = defineTool(run, {
    description:
      "List the workspace's most recently updated screenshots, canvases and posts, newest " +
      'first, each with the address that opens it. Filter by kind or by words in the name.',
    effect: 'read',
    execute: async ({ kind, search }) => {
      const want = (value: (typeof WORK_KINDS)[number]) => !kind || kind === value
      const query = { limit: 8, search: search || undefined }
      const [projects, canvases, drafts] = await Promise.all([
        want('screenshot') ? listProjects(access, { ...query, sort: 'updated' }) : null,
        want('canvas') ? listCanvases(access, { ...query, sort: 'updated' }) : null,
        want('post') && contentDraftsEnabled()
          ? listContentDrafts(access, { ...query, sort: 'updated_desc' })
          : null,
      ])
      const items = [
        ...(projects?.items ?? []).map((item) => ({
          href: `/editor?project=${encodeURIComponent(item.id)}`,
          kind: 'screenshot',
          name: item.name,
          updatedAt: new Date(item.updatedAt).toISOString(),
        })),
        ...(canvases?.items ?? []).map((item) => ({
          href: `/canvas/${encodeURIComponent(item.id)}`,
          kind: 'canvas',
          name: item.name,
          updatedAt: new Date(item.updatedAt).toISOString(),
        })),
        ...(drafts?.items ?? []).map((item) => ({
          href: draftHref(item.id, item.socialSetId),
          kind: 'post',
          name: draftName({ excerpt: item.plainText, title: item.title }),
          status: item.status,
          updatedAt: new Date(item.updatedAt).toISOString(),
        })),
      ]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 12)
      return { items, ok: true as const }
    },
    inputSchema: z.object({
      kind: z.enum(WORK_KINDS).optional(),
      search: z.string().trim().max(120).optional(),
    }),
    maxCallsPerRun: 4,
    name: 'listRecentWork',
    permission: 'artifact:read',
    timeoutMs: 15_000,
  })

  const listWorkspaceCampaigns = defineTool(run, {
    description:
      "List the workspace's launch campaigns with their status and the address that opens each.",
    effect: 'read',
    execute: async () => {
      const campaigns = await listCampaigns(access)
      return {
        campaigns: campaigns.slice(0, 20).map((campaign) => ({
          feature: campaign.feature,
          href: `/campaigns/${encodeURIComponent(campaign.id)}`,
          name: campaign.name,
          status: campaign.status,
        })),
        ok: true as const,
      }
    },
    inputSchema: z.object({}),
    maxCallsPerRun: 2,
    name: 'listCampaigns',
    permission: 'workspace:read',
    timeoutMs: 15_000,
  })

  const findPages = defineTool(run, {
    description:
      'Find pages of this app by what they are for ("brand colours", "scheduled posts", ' +
      '"connect GitHub"). Returns page names and addresses; with no words, every page.',
    effect: 'read',
    execute: ({ query }) => {
      const pages = palettePages({
        campaignsEnabled: true,
        canManage: accessAllows(access, 'workspace:update'),
        draftsEnabled: contentDraftsEnabled(),
        sectionLabel: (key) => PLATFORM_DESTINATIONS.find((item) => item.key === key)?.label ?? key,
      })
      const found = query ? searchPages(pages, query) : pages
      return {
        ok: true as const,
        pages: found.slice(0, 15).map((page) => ({
          href: page.href,
          name: page.section ? `${page.label} · ${page.section}` : page.label,
        })),
      }
    },
    inputSchema: z.object({ query: z.string().trim().max(80).optional() }),
    maxCallsPerRun: 4,
    name: 'findPages',
    permission: 'workspace:read',
    timeoutMs: 5_000,
  })

  const offerLink = defineTool(run, {
    description:
      'Offer the person a button that opens a page of this app, under your reply. Use an ' +
      'address a tool returned. Up to four per reply.',
    effect: 'read',
    execute: ({ href, label }) => {
      const safe = internalHref(href)
      if (!safe)
        return { error: 'Only addresses inside this app can be offered.', ok: false as const }
      if (state.links.length >= MAX_LINKS)
        return { error: 'Four links is the most.', ok: false as const }
      if (!state.links.some((link) => link.href === safe)) state.links.push({ href: safe, label })
      return { offered: true, ok: true as const }
    },
    inputSchema: z.object({
      href: z.string().trim().min(1).max(300),
      label: z.string().trim().min(1).max(60),
    }),
    maxCallsPerRun: MAX_LINKS + 2,
    name: 'offerLink',
    permission: 'workspace:read',
    timeoutMs: 2_000,
  })

  return {
    findPages,
    getBrand,
    getProduct,
    listCampaigns: listWorkspaceCampaigns,
    listProductSurfaces,
    listRecentWork,
    offerLink,
  }
}
