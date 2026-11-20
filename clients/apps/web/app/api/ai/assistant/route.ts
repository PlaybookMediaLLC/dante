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
import { workspaceAssistantContract } from '@/lib/api/contracts/ai'
import { errorResponse, route } from '@/lib/api/route'
import { organizationAccess } from '@/lib/api/route-auth'
import { describePage } from '@/lib/assistant/page-context'
import { backendSDK } from '@/lib/backend/sdk'
import { isAiEnabled } from '@/lib/trpc/routers/launch'

/** A turn may take several tool steps; give it room on serverless hosts. */
export const maxDuration = 60

/** Model steps one turn may take: a few lookups, links, and the reply. */
const MAX_STEPS = 6

/**
 * One turn of the workspace assistant, the AI chat bar on every page.
 *
 * The browser keeps the conversation and sends it with the page it is on;
 * the model answers from that page, looking things up with read-only tools,
 * and may offer pages to open. Nothing it does changes the workspace.
 */
export const POST = route(workspaceAssistantContract, {
  auth: organizationAccess('workspace:read'),
  handler: async ({ access, body }) => {
    if (!isCampaignStudioConfigured()) return errorResponse(503, 'AI is not configured.')
    if (!(await isAiEnabled(access))) {
      return errorResponse(403, 'AI is turned off for this workspace.')
    }
    const messages = body.messages as unknown as ModelMessage[]
    if (messages.at(-1)?.role !== 'user') return errorResponse(400, 'End with a user message.')
    const backend = backendSDK(access)
    const run = createToolRun({ access, audit: (event) => backend.appendAuditEvent(event) })
    const state: AssistantTurnState = { links: [] }
    try {
      // Every model call is charged AI credits for what it costs.
      return await withAiCredits(access, async () => {
        const result = await generateText({
          messages,
          model: models.languageModel('drafting'),
          stopWhen: [stepCountIs(MAX_STEPS), isRunStopped(run)],
          system: `${WORKSPACE_ASSISTANT_INSTRUCTIONS}\n\n${describePage(body.page)}`,
          tools: workspaceAssistantTools(run, state),
        })
        return { links: state.links, messages: result.response.messages, text: result.text }
      })
    } finally {
      await flushToolRun(run)
    }
  },
})
