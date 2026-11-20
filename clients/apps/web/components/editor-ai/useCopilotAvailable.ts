'use client'

import { useQuery } from '@tanstack/react-query'
import { useTRPCClient } from '@/lib/trpc/react'

/**
 * Whether this workspace has the design copilot (an AI key and AI turned on),
 * read once and shared by every surface that offers it.
 */
export function useCopilotAvailable(): boolean {
  const client = useTRPCClient()
  const status = useQuery({
    queryKey: ['editor-ai', 'status'],
    queryFn: () => client.editorAi.status.query(),
    staleTime: 300_000,
  })
  return status.data?.copilot === true
}
