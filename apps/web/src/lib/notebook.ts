import type {
  AgentEvent,
  ErrorEvent,
  HandoffEvent,
  ModelSelectedEvent,
  RouteDecidedEvent,
  RunDoneEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '../types/events'

// Turns the flat, technical event stream into a reporter's-notebook-shaped
// list: a tool_call and its tool_result are almost always adjacent in the
// stream (see apps/api/orchestrator.py — the call is yielded, dispatched,
// then the result is yielded immediately after), so they're merged into
// one entry here rather than shown as two separate technical log lines.
// Repeated model_selected events for the same model are also collapsed —
// the model rarely changes mid-run, and re-announcing it every step reads
// as noise, not information.

export type NotebookEntry =
  | { kind: 'action'; key: string; agent: string; ts: number; call?: ToolCallEvent; result?: ToolResultEvent }
  | { kind: 'thinking'; key: string; agent: string; ts: number; text: string }
  | { kind: 'model'; key: string; agent: string; ts: number; model: string; rationale: string }
  | { kind: 'handoff'; key: string; ts: number; from: string; to: string; reason: string }
  | { kind: 'route'; key: string; ts: number; chosen: string[]; rationale: string }
  | { kind: 'error'; key: string; ts: number; message: string }
  | { kind: 'done'; key: string; ts: number; steps: number; toolCalls: number }

export function buildNotebook(events: AgentEvent[]): NotebookEntry[] {
  const out: NotebookEntry[] = []
  let lastModel: string | null = null

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    switch (e.type) {
      case 'model_selected': {
        const ev = e as ModelSelectedEvent
        if (ev.model !== lastModel) {
          out.push({ kind: 'model', key: `m${i}`, agent: ev.agent, ts: ev.ts, model: ev.model, rationale: ev.rationale })
          lastModel = ev.model
        }
        break
      }
      case 'tool_call': {
        const call = e as ToolCallEvent
        const next = events[i + 1]
        const result =
          next && next.type === 'tool_result' && (next as ToolResultEvent).step === call.step && next.agent === call.agent
            ? (next as ToolResultEvent)
            : undefined
        out.push({ kind: 'action', key: `a${i}`, agent: call.agent, ts: call.ts, call, result })
        if (result) i++
        break
      }
      case 'tool_result': {
        const result = e as ToolResultEvent
        out.push({ kind: 'action', key: `a${i}`, agent: result.agent, ts: result.ts, result })
        break
      }
      case 'thinking': {
        const ev = e as ThinkingEvent
        out.push({ kind: 'thinking', key: `t${i}`, agent: ev.agent, ts: ev.ts, text: ev.text })
        break
      }
      case 'handoff': {
        const ev = e as HandoffEvent
        out.push({ kind: 'handoff', key: `h${i}`, ts: ev.ts, from: ev.from_agent, to: ev.to_agent, reason: ev.reason })
        break
      }
      case 'route_decided': {
        const ev = e as RouteDecidedEvent
        out.push({ kind: 'route', key: `r${i}`, ts: ev.ts, chosen: ev.chosen, rationale: ev.rationale })
        break
      }
      case 'error': {
        const ev = e as ErrorEvent
        out.push({ kind: 'error', key: `e${i}`, ts: ev.ts, message: ev.message })
        break
      }
      case 'run_done': {
        const ev = e as RunDoneEvent
        out.push({ kind: 'done', key: `d${i}`, ts: ev.ts, steps: ev.steps, toolCalls: ev.tool_calls })
        break
      }
      default:
        break // answer_done / transcript_ready are handled separately by callers
    }
  }

  return out
}
