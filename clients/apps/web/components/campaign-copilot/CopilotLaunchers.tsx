'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react/dist/ssr/SpinnerGap'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTRPCClient } from '@/lib/trpc/react'
import { CampaignCopilot } from './CampaignCopilot'
import { useAssistantAbility } from '@/components/assistant/AssistantProvider'
import Link from 'next/link'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * The campaigns list's one-sentence start: "What did you ship?" creates a
 * conversation, sends the sentence, and opens the panel on it.
 */
export function ShipInput({
  aiEnabled,
  hasProfile = false,
  products = [],
}: {
  aiEnabled: boolean
  hasProfile?: boolean
  products?: { name: string; slug: string; url: string }[]
}) {
  const client = useTRPCClient()
  const [value, setValue] = useState('')
  const [productSlug, setProductSlug] = useState(products[0]?.slug ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim()) return
    const product = products.find((entry) => entry.slug === productSlug)
    const content = product
      ? `${value.trim()}\nUse product ${product.name} (surface slug: ${product.slug}, URL: ${product.url}).`
      : value.trim()
    setBusy(true)
    setError(null)
    try {
      const { conversation } = await client.conversation.create.mutate({
        title: content.slice(0, 80),
      })
      await client.conversation.send.mutate({ content, conversationId: conversation.id })
      setConversationId(conversation.id)
      setOpen(true)
      setValue('')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  if (!aiEnabled) {
    return (
      <p className="rounded-2xl bg-foreground/[0.02] px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
        AI is turned off for this workspace.
      </p>
    )
  }
  if (!hasProfile && products.length === 0)
    return (
      <p className="rounded-2xl bg-foreground/[0.02] px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
        To draft from what you shipped,{' '}
        <Link className="underline" href="/onboarding/product">
          add your product
        </Link>
        .
      </p>
    )
  return (
    <>
      <form
        className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border sm:p-6"
        onSubmit={submit}
      >
        <Label
          className="text-lg leading-snug font-normal tracking-[-0.01em] text-foreground"
          htmlFor="ship-input"
        >
          What did you ship?
        </Label>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {products.length > 0 ? (
            <Select value={productSlug} onValueChange={setProductSlug} disabled={busy}>
              <SelectTrigger
                aria-label="Product for quick draft"
                className="h-11 w-full rounded-full bg-background px-4 md:w-56"
              >
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.slug} value={product.slug}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            className="h-11 w-full flex-1 rounded-full bg-background px-4 text-sm text-foreground ring-1 ring-foreground/[0.08] outline-none placeholder:text-muted-foreground/75 focus:ring-foreground/20"
            disabled={busy}
            id="ship-input"
            maxLength={4_000}
            onChange={(event) => setValue(event.target.value)}
            placeholder="We just shipped recurring invoices. Market it."
            value={value}
          />
          <Button className="h-11 rounded-full px-5" disabled={busy || !value.trim()} type="submit">
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            Draft a campaign
          </Button>
        </div>
        {error ? (
          <p
            className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </form>
      <CampaignCopilot
        aiEnabled={aiEnabled}
        conversationId={conversationId}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  )
}

/**
 * "Ask Shots" on a campaign's pages: opens the panel on the campaign's latest
 * conversation, or a new one about it.
 */
export function AskShotsButton({
  aiEnabled,
  campaignId,
}: {
  aiEnabled: boolean
  campaignId: string
}) {
  const client = useTRPCClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  /** The campaign's latest conversation, or a new one about it. */
  async function conversation(): Promise<string> {
    if (conversationId) return conversationId
    const { conversations } = await client.conversation.list.query({ campaignId })
    const id =
      conversations[0]?.id ??
      (await client.conversation.create.mutate({ campaignId })).conversation.id
    setConversationId(id)
    return id
  }

  // The assistant bar on this campaign's pages asks the campaign agent; the panel shows its run.
  useAssistantAbility(
    aiEnabled
      ? {
          id: `campaign-agent:${campaignId}`,
          label: 'Campaign agent',
          placeholder: 'Ask the campaign agent about this campaign',
          priority: 10,
          suggestions: [
            'What is left before this campaign ships?',
            'Tighten the launch copy',
            'Make a product shot for each channel',
          ],
          run: async ({ ask, push }) => {
            const id = await conversation()
            await client.conversation.send.mutate({ content: ask, conversationId: id })
            setOpen(true)
            push({ kind: 'note', text: 'Sent to the campaign agent. Its work shows in the panel.' })
          },
        }
      : null
  )

  async function openPanel() {
    setError(null)
    if (conversationId) return setOpen(true)
    setBusy(true)
    try {
      await conversation()
      setOpen(true)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        className="rounded-lg"
        disabled={busy}
        onClick={() => void openPanel()}
        size="sm"
        title={error ?? undefined}
        type="button"
        variant="outline"
      >
        {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
        Ask Shots
      </Button>
      {error ? (
        <span className="text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </span>
      ) : null}
      <CampaignCopilot
        aiEnabled={aiEnabled}
        conversationId={conversationId}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  )
}
