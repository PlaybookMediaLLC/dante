import 'server-only'

import { generateText, type ModelMessage, stepCountIs } from 'ai'
import { isCampaignStudioConfigured } from '@/lib/ai/agents/campaign-studio'
import { withAiCredits } from '@/lib/ai/metering'
import { models } from '@/lib/ai/models'
import { WORKSPACE_ASSISTANT_INSTRUCTIONS } from '@/lib/ai/prompts/workspace-assistant'
import { createToolRun, flushToolRun, isRunStopped } from '@/lib/ai/tools/executor'
import {
  type AssistantTurnState,
  workspaceAssistantTools,
} from '@/lib/ai/tools/workspace-assistant'
import { LAUNCH_AI_RATE_LIMIT } from '@/lib/api/rate-limit-policy'
import { describePage, type PageContext } from '@/lib/assistant/page-context'
import type { OrganizationAccess } from '@/lib/auth/access'
import { backendSDK } from '@/lib/backend/sdk'
import { checkRateLimit } from '@/lib/rate-limit'
import { consumeWorkspaceQuota } from '@/lib/tenant/entitlements'
import { isAiEnabled } from '@/lib/trpc/routers/launch'

/** Model steps one turn may take: a few lookups, links, and the reply. */
const MAX_STEPS = 6

/** Why a turn cannot start, with the status the route answers. */
export class AssistantRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 429 | 503
  ) {
    super(message)
    this.name = 'AssistantRefusal'
  }
}

/**
 * One turn of the workspace assistant: the person's conversation and the page
 * they are on, answered with read-only, audited tools. The same guards as
 * every AI action: configured, turned on for the workspace, within the
 * workspace's AI rate, with credits left (each model call is charged).
 */
export async function runWorkspaceAssistantTurn(
  access: OrganizationAccess,
  { messages, page, signal }: { messages: ModelMessage[]; page: PageContext; signal?: AbortSignal }
) {
  if (!isCampaignStudioConfigured()) throw new AssistantRefusal('AI is not configured.', 503)
  if (!(await isAiEnabled(access)))
    throw new AssistantRefusal('AI is turned off for this workspace.', 403)
  if (messages.at(-1)?.role !== 'user') throw new AssistantRefusal('End with a user message.', 400)
  const limit = await checkRateLimit(`launch-ai:${access.organizationId}`, LAUNCH_AI_RATE_LIMIT)
  if (!limit.allowed)
    throw new AssistantRefusal('Too many AI requests. Wait a minute and try again.', 429)
  await consumeWorkspaceQuota(access, 'ai:credits:monthly', 0)

  const backend = backendSDK(access)
  const run = createToolRun({ access, audit: (event) => backend.appendAuditEvent(event), signal })
  // The page's own address is always offerable; the rest must come from a tool.
  const state: AssistantTurnState = { known: new Set([page.path]), links: [] }
  try {
    return await withAiCredits(access, async () => {
      const result = await generateText({
        abortSignal: signal,
        messages,
        model: models.languageModel('drafting'),
        stopWhen: [stepCountIs(MAX_STEPS), isRunStopped(run)],
        system: `${WORKSPACE_ASSISTANT_INSTRUCTIONS}\n\n${describePage(page)}`,
        tools: workspaceAssistantTools(run, state),
      })
      return { links: state.links, messages: result.response.messages, text: result.text }
    })
  } finally {
    await flushToolRun(run)
  }
}
