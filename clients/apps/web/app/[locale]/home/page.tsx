import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { platformHref } from '@/lib/platform/navigation'
import { PlatformShell } from '@/components/platform-shell/PlatformShell'
import { Page } from '@/components/platform-ui'
import { Stage } from '@/components/platform-landing/primitives'
import { ArrowForwardIcon as ArrowRight } from '@/components/platform-shell/icons'
import { ImageIcon as ImagePlus } from '@/components/platform-shell/icons'
import { EditIcon as PenLine } from '@/components/platform-shell/icons'
import { CampaignsIcon as Megaphone } from '@/components/platform-shell/icons'
import { AutomateIcon as Workflow } from '@/components/platform-shell/icons'
import { CategoryIcon as Shapes } from '@/components/platform-shell/icons'
import { SidebarLink } from '@/components/platform-shell/SidebarLink'
import { SearchField } from '@/components/platform-shell/ShellActions'
import { ButtonLink } from '@/components/platform-shell/ButtonLink'
import { NeedsAttention } from '@/components/platform-hub/NeedsAttention'
import { RecentWork } from '@/components/platform-hub/RecentWork'
import { requirePaidPageAccess, sessionTenant } from '@/lib/auth/page-access'
import type { OrganizationAccess } from '@/lib/auth/access'
import { Suspense } from 'react'
import { accessAllows, normalizeOrganizationRole, type Permission } from '@/lib/auth/permissions'
import { roleLabels } from '@/lib/auth/role-descriptions'
import { StartPostAction } from '@/components/platform-hub/StartPostAction'
import { QueueNudge } from '@/components/platform-hub/QueueNudge'
import { listContentDraftPostsBetween } from '@/lib/tenant/content-drafts'
import { contentDraftsEnabled } from '@/lib/content-drafts/flag'

export const metadata = { title: 'Home' }
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams])
  // Localized legacy editor bookmarks reach this page after locale routing.
  if (['project', 'editor', 'storeProject'].some((key) => query[key] !== undefined)) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
        search.append(key, item)
    }
    redirect(platformHref(locale === 'en' ? '/' : `/${locale}`, `/editor?${search}`))
  }
  // A contract that grants drafts without a paid plan gets Home too; paid starters lead to the plan page.
  const requestHeaders = await headers()
  const access = await requirePaidPageAccess(requestHeaders, locale, '/home', 'content:drafts')
  const paid = access.hasPaidPlan
  const gated = (href: string) => (paid ? href : `/upgrade?from=${encodeURIComponent(href)}`)
  const can = (permission: Permission) => accessAllows(access, permission)
  const starters = [
    {
      title: 'Create a visual',
      description: 'Screenshots, mockups, and designs.',
      href: gated('/create'),
      icon: ImagePlus,
      pro: !paid,
      allowed: can('artifact:edit'),
    },
    ...(contentDraftsEnabled()
      ? [
          {
            title: 'Write a post',
            description: 'Draft and schedule your posts.',
            href: '/publish',
            icon: PenLine,
            // Makes the draft at once, as New → Post does.
            startsPost: true,
            allowed: can('artifact:edit'),
          },
        ]
      : []),
    ...(access.campaignWorkflowEnabled
      ? [
          {
            title: 'Plan a campaign',
            description: 'Organize your next product launch.',
            href: gated('/campaigns/new'),
            icon: Megaphone,
            pro: !paid,
            allowed: can('release:create'),
          },
        ]
      : []),
    {
      title: 'Turn releases into campaigns',
      description: 'Draft a campaign each time you ship.',
      // Automate opens without a paid plan and says there that its runs need Pro.
      href: paid ? '/workflows/new' : '/workflows',
      icon: Workflow,
      pro: !paid,
      allowed: can('workspace:update'),
    },
  ] as {
    title: string
    description: string
    href: string
    icon: typeof Workflow
    pro?: boolean
    startsPost?: boolean
    allowed: boolean
  }[]
  // Starters the role cannot use are left out, and the page says why.
  const available = starters.filter((starter) => starter.allowed)
  return (
    <PlatformShell
      campaignsEnabled={access.campaignWorkflowEnabled}
      organizationName={access.organization?.name}
    >
      <Page
        title="Home"
        actions={
          <>
            <SearchField />
            {paid ? null : (
              <ButtonLink href="/upgrade" variant="outline" className="gap-2 rounded-full">
                See plans <ArrowRight size={15} aria-hidden="true" />
              </ButtonLink>
            )}
          </>
        }
      >
        <section aria-labelledby="home-start" className="platform-home">
          <h2 className="home-eyebrow" id="home-start">
            Start something new
          </h2>
          {available.length < starters.length ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Your {roleLabels[normalizeOrganizationRole(access.role)]} role can view this
              workspace&apos;s work{available.length ? ' and start what is listed here' : ''}. Ask a
              workspace owner or admin for more access.
            </p>
          ) : null}
          <ul className="home-starters">
            {available.map(({ title, description, href, icon: Icon, pro, startsPost }, index) => {
              const content = (
                <>
                  <span className="home-starter-tile" aria-hidden="true">
                    {/* A page coming out of the tile, like a template's first sheet. */}
                    <span className="home-starter-sheet">
                      <Stage className="h-14 w-full rounded-md" variant={index}>
                        <span className="grid size-7 place-items-center rounded-md bg-[#090909]/90 text-white ring-1 ring-white/10">
                          <Icon size={15} />
                        </span>
                      </Stage>
                      <span className="mt-2.5 block h-1.5 w-[70%] rounded-full bg-foreground/15" />
                      <span className="mt-1.5 block h-1.5 w-[48%] rounded-full bg-foreground/10" />
                    </span>
                  </span>
                  <span className="home-starter-title">
                    {title}
                    {pro ? <span className="platform-pro-badge">Pro</span> : null}
                  </span>
                  <span className="home-starter-detail">{description}</span>
                </>
              )
              return (
                <li key={href}>
                  {startsPost ? (
                    <StartPostAction>{content}</StartPostAction>
                  ) : (
                    <SidebarLink href={href} className="home-starter group">
                      {content}
                    </SidebarLink>
                  )}
                </li>
              )
            })}
            {paid ? (
              <li>
                <SidebarLink href="/create?view=templates" className="home-starter group">
                  <span className="home-starter-tile home-starter-collage" aria-hidden="true">
                    {[0, 1, 2, 3].map((variant) => (
                      <Stage key={variant} className="size-full rounded-lg" variant={variant + 2}>
                        {null}
                      </Stage>
                    ))}
                    <span className="home-starter-collage-icon">
                      <Shapes size={16} />
                    </span>
                  </span>
                  <span className="home-starter-title">Browse all templates</span>
                  <span className="home-starter-detail">Finished looks for your next visual.</span>
                </SidebarLink>
              </li>
            ) : null}
          </ul>
        </section>

        {paid && contentDraftsEnabled() && can('artifact:edit') && access.organization ? (
          <Suspense fallback={null}>
            <UpcomingQueue tenant={sessionTenant(access, access.organization.id, requestHeaders)} />
          </Suspense>
        ) : null}
        <div className="home-work platform-home">
          <RecentWork
            organizationId={access.organization!.id}
            draftsEnabled={contentDraftsEnabled()}
            paidPlan={paid}
          />
          <NeedsAttention />
        </div>

        <SidebarLink href={gated('/library?view=brand')} className="platform-home home-brand group">
          <span className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center">
              <Shapes size={19} className="text-muted-foreground" aria-hidden="true" />
            </span>
            <span>
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                Brand assets
                {paid ? null : <span className="platform-pro-badge">Pro</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Your logos, colours and fonts, ready for every visual.
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs font-medium">
            Open in Library <ArrowRight size={15} aria-hidden="true" />
          </span>
        </SidebarLink>
      </Page>
    </PlatformShell>
  )
}

/**
 * Drafts queued for the next seven days, streamed after the page: Home nudges
 * below three. A failed read is logged and shows nothing.
 */
async function UpcomingQueue({ tenant }: { tenant: OrganizationAccess }) {
  const now = new Date()
  const posts = await listContentDraftPostsBetween(
    tenant,
    now,
    new Date(now.getTime() + 7 * 86_400_000)
  ).catch((error: unknown) => {
    console.error('Home could not read the queue for its nudge', error)
    return null
  })
  if (!posts) return null
  const queued = new Set(
    posts
      .filter((post) => post.status === 'SCHEDULED' || post.status === 'PROCESSING')
      .map((post) => post.draftId)
  ).size
  return queued < 3 ? <QueueNudge queued={queued} /> : null
}
