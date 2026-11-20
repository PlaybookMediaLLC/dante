'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createWritingDraft, useBlankDraft } from '@/components/write/pending-draft'
import { platformHref } from '@/lib/platform/navigation'
import { prepareWorkspaceSwitch } from '@/lib/platform/navigation-guard'
import { importedBody } from '@/lib/write/import-text'

/**
 * A post the assistant wrote: its text, and a button that saves it as a
 * draft and opens it in the post editor. Nothing is saved before the click.
 */
export function AssistantPost({ text }: { text: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [opening, setOpening] = useState(false)
  // One post opens at a time; another open (New → Post) waits for this one.
  const busy = useBlankDraft()
  return (
    <figure className="grid gap-2 rounded-2xl border bg-background p-3">
      <blockquote className="max-h-48 overflow-y-auto text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
        {text}
      </blockquote>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 justify-self-start rounded-full px-3 text-xs"
        disabled={opening || busy}
        title={busy ? 'Finish the open post first' : undefined}
        onClick={() => {
          setOpening(true)
          // The pending post shows its own progress and errors; unsaved work is saved first.
          void createWritingDraft(
            { body: importedBody([text]) },
            (id) => router.push(platformHref(pathname, `/publish/${encodeURIComponent(id)}`)),
            prepareWorkspaceSwitch
          ).finally(() => setOpening(false))
        }}
      >
        {opening ? 'Opening…' : 'Open as a draft'}
      </Button>
    </figure>
  )
}
