import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PlatformShell } from '@/components/platform-shell/PlatformShell'
import { Page } from '@/components/platform-ui'
import { CompressVideoLoader } from '@/components/compress-video/CompressVideoLoader'
import { TabRow } from '@/components/plan/WorkspaceNav'
import { RemoveBackgroundLoader } from '@/components/remove-background/RemoveBackgroundLoader'
import { ToolWorkspace } from '@/components/tools/ToolWorkspace'
import { requirePaidPageAccess } from '@/lib/auth/page-access'
import { IN_APP_TOOLS } from '@/lib/platform/navigation'
import { getTool } from '@/lib/seo/tools'

const CropWorkspace = dynamic(() =>
  import('@/components/tools/CropWorkspace').then((mod) => mod.CropWorkspace)
)

type ToolPageProps = { params: Promise<{ locale: string; tool: string }> }

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { tool } = await params
  const title = IN_APP_TOOLS.find((entry) => entry.slug === tool)?.title
  return { title: title ? `${title} · Image tools` : 'Image tools' }
}

/** An image tool inside the app shell; the public page at /<tool> stays for search. */
export default async function InAppToolPage({ params }: ToolPageProps) {
  const { locale, tool: slug } = await params
  const entry = IN_APP_TOOLS.find((candidate) => candidate.slug === slug)
  if (!entry) notFound()
  const access = await requirePaidPageAccess(await headers(), locale, `/create/tools/${slug}`)
  const tool = getTool(`/${slug}`)
  return (
    <PlatformShell
      campaignsEnabled={access.campaignWorkflowEnabled}
      organizationName={access.organization?.name}
    >
      <Page title="Image tools" description={entry.description}>
        <TabRow
          label="Image tools"
          active={entry.label}
          items={IN_APP_TOOLS.map((item) => ({
            href: `/create/tools/${item.slug}`,
            label: item.label,
          }))}
          secondary
        />
        {slug === 'remove-background' ? (
          <RemoveBackgroundLoader />
        ) : slug === 'compress-video' ? (
          <CompressVideoLoader />
        ) : tool?.engine === 'crop' ? (
          <CropWorkspace tool={tool} />
        ) : tool ? (
          <ToolWorkspace tool={tool} />
        ) : (
          notFound()
        )}
      </Page>
    </PlatformShell>
  )
}
