import type { AgentEvent } from '../types/events'
import ModelBadge from './ModelBadge'

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  return parts.join(', ')
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour12: false })
}

export default function TraceStep({ event }: { event: AgentEvent }) {
  const time = <span className="w-16 shrink-0 text-(--color-muted)">{formatTime(event.ts)}</span>

  switch (event.type) {
    case 'model_selected':
      return (
        <div className="flex items-center gap-2 py-1 font-(family-name:--font-mono) text-xs">
          {time}
          <ModelBadge model={event.model} rationale={event.rationale} />
        </div>
      )

    case 'thinking':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) italic">
          {time}
          <span>🧠 {event.text}</span>
        </div>
      )

    case 'tool_call':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs">
          {time}
          <span>
            <span className="text-(--color-amber)">🔧 {event.tool}</span>
            <span className="text-(--color-muted)">({formatArgs(event.args)})</span>
          </span>
        </div>
      )

    case 'tool_result':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs">
          {time}
          <span className={event.ok ? 'text-(--color-paper)' : 'text-(--color-error)'}>
            {event.ok ? '📄' : '⚠️'} {event.summary}
            {event.sources.length > 0 && (
              <span className="ml-1 text-(--color-amber)">
                [{event.sources.map((s) => s.index).join(', ')}]
              </span>
            )}
          </span>
        </div>
      )

    case 'error':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs text-(--color-error)">
          {time}
          <span>✕ {event.message}</span>
        </div>
      )

    case 'run_done':
      return (
        <div className="flex items-start gap-2 py-2 font-(family-name:--font-mono) text-xs text-(--color-ok)">
          {time}
          <span>
            ✓ done — {event.steps} step{event.steps === 1 ? '' : 's'}, {event.tool_calls} tool call
            {event.tool_calls === 1 ? '' : 's'}
          </span>
        </div>
      )

    default:
      return null
  }
}
