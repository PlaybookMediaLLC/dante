import { headers } from 'next/headers'
import { PlatformShell } from '@/components/platform-shell/PlatformShell'
import { TweetImageEditorLoader } from '@/components/tweet-image/TweetImageEditorLoader'
import { requirePaidPageAccess } from '@/lib/auth/page-access'

export const metadata = { title: 'Tweet image' }

/** The tweet image editor inside the app shell; the public page at /tweet stays for search. */
export default async function InAppTweetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const access = await requirePaidPageAccess(await headers(), locale, '/create/tweet')
  return (
    <PlatformShell
      variant="editor"
      campaignsEnabled={access.campaignWorkflowEnabled}
      organizationName={access.organization?.name}
    >
      <TweetImageEditorLoader />
    </PlatformShell>
  )
}
