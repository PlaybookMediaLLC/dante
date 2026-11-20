'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { SparkleIcon } from '@phosphor-icons/react/dist/ssr/Sparkle'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowUp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTRPCClient } from '@/lib/trpc/react'

/**
 * Create's prompt bar: a new screenshot that opens with the editor's AI
 * copilot holding this request (EditorAiPanel reads `ask`). Shown only where
 * the workspace has the copilot, so it never promises what cannot run.
 */
export function EditorPromptBar() {
  const client = useTRPCClient()
  const router = useRouter()
  const [text, setText] = useState('')
  const status = useQuery({
    queryKey: ['editor-ai', 'status'],
    queryFn: () => client.editorAi.status.query(),
    staleTime: 300_000,
  })
  if (!status.data?.copilot) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const ask = text.trim()
    if (ask) router.push(`/editor?${new URLSearchParams({ start: 'new', ask })}`)
  }
  return (
    <form onSubmit={submit} className="create-prompt" role="search" aria-label="Describe a visual">
      <SparkleIcon aria-hidden="true" className="size-4 shrink-0 text-violet-500" />
      <Input
        aria-label="Describe the visual you want"
        placeholder="Describe the visual you want, then add your screenshot"
        value={text}
        maxLength={2000}
        onChange={(event) => setText(event.target.value)}
        className="h-9 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="submit"
        size={null}
        variant="custom"
        aria-label="Open in the editor"
        disabled={!text.trim()}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
      >
        <ArrowUpIcon className="size-4" aria-hidden="true" />
      </Button>
    </form>
  )
}
