import { z } from 'zod'
import { defineContract } from '@/lib/api/contract'
import { contentDraftIdSchema } from '@/lib/api/contracts/content-draft-list'
import { draftChannelSchema } from '@/lib/write/document'
import { INTERNAL_HREF_MAX, pageContextSchema } from '@/lib/assistant/page-context'

/** Most messages one copilot request may carry. */
export const MAX_EDITOR_MESSAGES = 80

/** Roles the browser may send. It may not inject system or operator messages. */
export const editorMessageRoleSchema = z.enum(['user', 'assistant', 'tool'])

/** Roles the model's response messages carry. */
export const editorResponseRoleSchema = z.enum(['assistant', 'tool'])

/** One step of the in-editor copilot loop, as the browser posts it. */
export const editorCopilotRequestSchema = z.object({
  messages: z
    .array(z.looseObject({ role: editorMessageRoleSchema }))
    .min(1)
    .max(MAX_EDITOR_MESSAGES),
  selection: z.string().max(200).nullable().default(null),
})

/**
 * The model's turn. `messages` are AI SDK response messages the browser
 * echoes back verbatim, so they pass through with every key intact.
 */
export const editorCopilotResponseSchema = z.object({
  done: z.boolean(),
  messages: z.array(z.looseObject({ role: editorResponseRoleSchema })),
  pendingToolCalls: z.array(
    z.object({ input: z.unknown(), toolCallId: z.string(), toolName: z.string() })
  ),
  text: z.string(),
})

/** `POST /api/ai/editor` */
export const editorCopilotContract = defineContract({
  body: editorCopilotRequestSchema,
  method: 'POST',
  name: 'ai.editor',
  output: editorCopilotResponseSchema,
  path: '/api/ai/editor',
  summary: 'Run one step of the editor copilot',
})

/** Most messages one workspace assistant request may carry. */
export const MAX_ASSISTANT_MESSAGES = 40

/**
 * One turn of the workspace assistant: the conversation so far, ending with
 * the person's message, and the page they are on.
 */
export const workspaceAssistantRequestSchema = z.object({
  messages: z
    .array(z.looseObject({ role: editorMessageRoleSchema }))
    .min(1)
    .max(MAX_ASSISTANT_MESSAGES),
  page: pageContextSchema,
})

/** A place in the app the assistant offers to open. */
export const assistantLinkSchema = z.object({
  href: z.string().max(INTERNAL_HREF_MAX),
  label: z.string().max(120),
})

/** Characters of one post the assistant drafts. */
export const ASSISTANT_POST_MAX = 3_000

/** A post the assistant wrote, offered to open as a draft. */
export const assistantPostSchema = z.object({ text: z.string().min(1).max(ASSISTANT_POST_MAX) })

/**
 * The assistant's reply, the places it offers, the posts it wrote, and the turn's AI SDK
 * messages, which the browser keeps and sends with its next turn.
 */
export const workspaceAssistantResponseSchema = z.object({
  links: z.array(assistantLinkSchema),
  messages: z.array(z.looseObject({ role: editorResponseRoleSchema })),
  posts: z.array(assistantPostSchema).max(2),
  text: z.string(),
})

/** `POST /api/ai/assistant` */
export const workspaceAssistantContract = defineContract({
  body: workspaceAssistantRequestSchema,
  method: 'POST',
  name: 'ai.assistant',
  output: workspaceAssistantResponseSchema,
  path: '/api/ai/assistant',
  summary: 'Answer one turn of the workspace assistant with the page it is asked from',
})

/** Most messages one document-editor AI request may carry. */
export const MAX_DOCUMENT_MESSAGES = 40

/** Roles the document editor may send; it may not inject system messages. */
export const documentMessageRoleSchema = z.enum(['user', 'assistant'])

/** What the document AI menu asks for (the editor's tool names). */
export const documentToolNameSchema = z.enum(['comment', 'edit', 'generate'])

/**
 * One document AI menu request, as the AI SDK chat transport posts it.
 * `system` is the editor's rendering of the document and selection: it is
 * untrusted user content, so the server passes it to the model as context and
 * never as instructions.
 */
export const documentChatRequestSchema = z.looseObject({
  ctx: z.looseObject({ toolName: documentToolNameSchema.nullable().optional() }).optional(),
  messages: z
    .array(
      z.looseObject({
        parts: z.array(z.looseObject({ type: z.string() })).max(100),
        role: documentMessageRoleSchema,
      })
    )
    .min(1)
    .max(MAX_DOCUMENT_MESSAGES),
  system: z.string().max(120_000).optional(),
})

/**
 * The draft the document editor writes, and the platform being edited, so the
 * AI writes in that draft's voice (its social set's, for that channel). Without
 * them, or for a draft the caller cannot see, the workspace voice applies.
 */
export const documentVoiceQuerySchema = z.object({
  channel: draftChannelSchema.optional(),
  draftId: contentDraftIdSchema.optional(),
})

/** `POST /api/ai/document`: streams AI SDK UI message parts. */
export const documentChatContract = defineContract({
  body: documentChatRequestSchema,
  method: 'POST',
  name: 'ai.document',
  output: z.never(),
  path: '/api/ai/document',
  query: documentVoiceQuerySchema,
  summary: 'Stream a document editor AI response',
})

/** One inline completion request from the document editor's copilot. */
export const documentCopilotRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
})

/** The completion text, or `0` when the model has nothing worth suggesting. */
export const documentCopilotResponseSchema = z.object({ text: z.string().min(1) })

/** `POST /api/ai/document/copilot` */
export const documentCopilotContract = defineContract({
  body: documentCopilotRequestSchema,
  method: 'POST',
  name: 'ai.document-copilot',
  output: documentCopilotResponseSchema,
  path: '/api/ai/document/copilot',
  query: documentVoiceQuerySchema,
  summary: 'Suggest an inline completion in the document editor',
})
