'use client'

import { useQuery } from '@tanstack/react-query'
import { useTRPCClient } from '@/lib/trpc/react'

/**
 * Whether this workspace has AI (a model configured and AI turned on), read
 * once and shared: the assistant bar shows only where it does.
 */
export function useAiAvailable(): boolean {
  const client = useTRPCClient()
  const status = useQuery({
    queryKey: ['editor-ai', 'status'],
    queryFn: () => client.editorAi.status.query(),
    staleTime: 300_000,
  })
  return status.data?.copilot === true
}
