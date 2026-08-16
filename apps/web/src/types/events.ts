// Mirrors apps/api/events.py by hand — the surface is small and stable,
// not worth codegen for a teaching app.

export interface SourceRef {
  index: number
  title: string
  url: string
  snippet: string
  published_at: string | null
  tool: string
  fetched_at: number
}

interface BaseEvent {
  run_id: string
  ts: number
}

export interface ThinkingEvent extends BaseEvent {
  type: 'thinking'
  agent: string
  text: string
}

export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call'
  agent: string
  step: number
  tool: string
  args: Record<string, unknown>
  cost_hint: string | null
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool_result'
  agent: string
  step: number
  tool: string
  ok: boolean
  summary: string
  sources: SourceRef[]
  error: string | null
}

export interface ModelSelectedEvent extends BaseEvent {
  type: 'model_selected'
  agent: string
  model: string
  task_kind: string
  rationale: string
}

export interface AnswerDoneEvent extends BaseEvent {
  type: 'answer_done'
  agent: string
  text: string
  sources: SourceRef[]
}

export interface ErrorEvent extends BaseEvent {
  type: 'error'
  message: string
  fatal: boolean
}

export interface RunDoneEvent extends BaseEvent {
  type: 'run_done'
  steps: number
  tool_calls: number
}

export type AgentEvent =
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | ModelSelectedEvent
  | AnswerDoneEvent
  | ErrorEvent
  | RunDoneEvent

export interface AgentInfo {
  id: string
  name: string
  description: string
  color: string
  tools: string[]
}
