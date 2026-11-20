import { redirect } from 'next/navigation'
import { getLocalizedPath } from '@/lib/auth/page-access'
import { IN_APP_TOOLS } from '@/lib/platform/navigation'

/** Image tools open on the first tool; the tab row switches between them. */
export default async function ImageToolsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect(getLocalizedPath(locale, `/create/tools/${IN_APP_TOOLS[0].slug}`))
}
