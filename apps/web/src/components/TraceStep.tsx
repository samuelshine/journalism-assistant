import type { AgentEvent, AgentInfo } from '../types/events'
import ModelBadge from './ModelBadge'

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  return parts.join(', ')
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour12: false })
}

function AgentDot({ agentId, agentsById }: { agentId: string; agentsById: Record<string, AgentInfo> }) {
  const info = agentsById[agentId]
  if (!info) return null
  return (
    <span
      title={info.name}
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--color-${info.color})` }}
    />
  )
}

interface Props {
  event: AgentEvent
  agentsById: Record<string, AgentInfo>
}

export default function TraceStep({ event, agentsById }: Props) {
  const time = <span className="w-16 shrink-0 text-(--color-muted)">{formatTime(event.ts)}</span>

  switch (event.type) {
    case 'route_decided':
      return (
        <div className="flex items-start gap-2 py-2 font-(family-name:--font-mono) text-xs">
          {time}
          <span className="text-(--color-amber)">
            🧭 routing to: {event.chosen.map((id) => agentsById[id]?.name ?? id).join(' → ')}
            <span className="ml-2 text-(--color-muted)">— {event.rationale}</span>
          </span>
        </div>
      )

    case 'handoff':
      return (
        <div className="my-1 flex items-center gap-2 border-t border-(--color-border) py-2 font-(family-name:--font-mono) text-xs">
          {time}
          <AgentDot agentId={event.to_agent} agentsById={agentsById} />
          <span className="font-medium text-(--color-paper)">
            {agentsById[event.from_agent]?.name ?? event.from_agent} → {agentsById[event.to_agent]?.name ?? event.to_agent}
          </span>
          <span className="text-(--color-muted)">— {event.reason}</span>
        </div>
      )

    case 'model_selected':
      return (
        <div className="flex items-center gap-2 py-1 font-(family-name:--font-mono) text-xs">
          {time}
          <AgentDot agentId={event.agent} agentsById={agentsById} />
          <ModelBadge model={event.model} rationale={event.rationale} />
        </div>
      )

    case 'thinking':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) italic">
          {time}
          <AgentDot agentId={event.agent} agentsById={agentsById} />
          <span>🧠 {event.text}</span>
        </div>
      )

    case 'tool_call':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs" title={event.cost_hint ?? undefined}>
          {time}
          <AgentDot agentId={event.agent} agentsById={agentsById} />
          <span>
            <span className="text-(--color-amber)">🔧 {event.tool}</span>
            <span className="text-(--color-muted)">({formatArgs(event.args)})</span>
            {event.cost_hint?.startsWith('🎬') && (
              <span className="ml-1.5 rounded bg-(--color-surface-raised) px-1 text-[10px] text-(--color-ok)">demo fixture</span>
            )}
          </span>
        </div>
      )

    case 'tool_result':
      return (
        <div className="flex items-start gap-2 py-1 font-(family-name:--font-mono) text-xs">
          {time}
          <AgentDot agentId={event.agent} agentsById={agentsById} />
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
