import type { ModelMessage } from 'ai'
import { AssistantRefusal, runWorkspaceAssistantTurn } from '@/lib/ai/assistant/turn'
import { workspaceAssistantContract } from '@/lib/api/contracts/ai'
import { errorResponse, route } from '@/lib/api/route'
import { organizationAccess } from '@/lib/api/route-auth'

/** A turn may take several tool steps; give it room on serverless hosts. */
export const maxDuration = 60

/**
 * One turn of the workspace assistant, the AI chat bar on every page: the
 * browser sends its conversation and the page it is on (lib/ai/assistant/turn).
 */
export const POST = route(workspaceAssistantContract, {
  auth: organizationAccess('workspace:read'),
  handler: async ({ access, body, request }) => {
    try {
      return await runWorkspaceAssistantTurn(access, {
        messages: body.messages as unknown as ModelMessage[],
        page: body.page,
        signal: request.signal,
      })
    } catch (error) {
      if (error instanceof AssistantRefusal) return errorResponse(error.status, error.message)
      throw error
    }
  },
})
