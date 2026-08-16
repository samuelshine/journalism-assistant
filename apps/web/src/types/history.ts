import type { AgentEvent, SourceRef } from './events'

export interface RunHistoryEntry {
  id: string
  prompt: string
  agentId: string // 'desk_chief' when it was a crew run
  startedAt: number
  events: AgentEvent[]
  sources: SourceRef[]
}
