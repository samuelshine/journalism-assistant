import { useState } from 'react'
import { narrateToolCall, toolLabel } from '../lib/narrate'
import type { NotebookEntry as Entry } from '../lib/notebook'
import type { AgentInfo } from '../types/events'
import ModelBadge from './ModelBadge'

function AgentDot({ agentId, agentsById }: { agentId: string; agentsById: Record<string, AgentInfo> }) {
  const info = agentsById[agentId]
  if (!info) return null
  return <span title={info.name} className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--color-${info.color})` }} />
}

function friendlyCostHint(hint: string | null | undefined): string | null {
  if (!hint) return null
  if (hint.startsWith('🎬')) return 'served from saved research — no live lookup needed'
  if (hint.startsWith('repeated')) return "already checked this once this run — reused that answer"
  return null
}

interface Props {
  entry: Entry
  agentsById: Record<string, AgentInfo>
}

export default function NotebookEntry({ entry, agentsById }: Props) {
  const [open, setOpen] = useState(false)

  switch (entry.kind) {
    case 'model':
      return (
        <div className="flex items-start gap-2.5 py-1">
          <AgentDot agentId={entry.agent} agentsById={agentsById} />
          <ModelBadge model={entry.model} rationale={entry.rationale} />
        </div>
      )

    case 'thinking':
      return (
        <div className="flex items-start gap-2.5 py-1">
          <AgentDot agentId={entry.agent} agentsById={agentsById} />
          <span className="font-(family-name:--font-serif) text-[13.5px] italic text-(--color-ink-faint)">{entry.text}</span>
        </div>
      )

    case 'handoff':
      return (
        <div className="my-2 flex items-center gap-2.5 border-t border-(--color-rule) py-2.5">
          <span className="font-(family-name:--font-sans) text-[11px] font-semibold tracking-wide text-(--color-masthead) uppercase">
            {agentsById[entry.from]?.name ?? entry.from} → {agentsById[entry.to]?.name ?? entry.to}
          </span>
          <span className="font-(family-name:--font-serif) text-[13px] text-(--color-ink-soft)">{entry.reason}</span>
        </div>
      )

    case 'route':
      return (
        <div className="my-2 rounded-sm border border-(--color-rule) bg-(--color-paper-sunken) px-3 py-2">
          <div className="font-(family-name:--font-sans) text-[11px] font-semibold tracking-wide text-(--color-masthead) uppercase">
            Assigning this to: {entry.chosen.map((id) => agentsById[id]?.name ?? id).join(' → ')}
          </div>
          <div className="mt-0.5 font-(family-name:--font-serif) text-[13px] text-(--color-ink-soft)">{entry.rationale}</div>
        </div>
      )

    case 'error':
      return (
        <div className="my-1.5 flex items-start gap-2.5 rounded-sm border border-(--color-error)/40 bg-(--color-error)/5 px-3 py-2">
          <span className="mt-0.5 font-(family-name:--font-serif) text-sm text-(--color-error)">⚠</span>
          <span className="font-(family-name:--font-serif) text-[13.5px] text-(--color-error)">{entry.message}</span>
        </div>
      )

    case 'done':
      return (
        <div className="mt-1 mb-1 font-(family-name:--font-serif) text-[12.5px] italic text-(--color-ink-faint)">
          — reporting done: {entry.toolCalls} check{entry.toolCalls === 1 ? '' : 's'} along the way
        </div>
      )

    case 'action': {
      const { call, result } = entry
      const label = call ? narrateToolCall(call.tool, call.args) : toolLabel(result?.tool ?? '')
      const ok = result ? result.ok : true
      const found = result?.sources.length ?? 0
      const friendlyHint = friendlyCostHint(call?.cost_hint)

      return (
        <div className="py-1">
          <div className="flex items-start gap-2.5">
            <AgentDot agentId={entry.agent} agentsById={agentsById} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="group flex w-full items-start gap-1.5 text-left"
              >
                <span className={`font-(family-name:--font-serif) text-[14px] ${ok ? 'text-(--color-ink)' : 'text-(--color-contested)'}`}>
                  {label}
                  {result === undefined && <span className="text-(--color-ink-faint)">…</span>}
                  {result && !ok && <span className="text-(--color-contested)"> — no luck there</span>}
                  {result && ok && found > 0 && (
                    <span className="text-(--color-ink-faint)">
                      {' '}
                      — found {found} source{found === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
                <span className="mt-1 shrink-0 font-(family-name:--font-sans) text-[10px] text-(--color-ink-faint) opacity-0 group-hover:opacity-100">
                  {open ? 'hide detail' : 'show detail'}
                </span>
              </button>
              {friendlyHint && (
                <div className="mt-0.5 font-(family-name:--font-sans) text-[10px] tracking-wide text-(--color-verified) uppercase">
                  {friendlyHint}
                </div>
              )}
              {open && (
                <div className="mt-1.5 space-y-1 rounded-sm border border-(--color-rule) bg-(--color-paper-sunken) px-2.5 py-2 font-(family-name:--font-mono) text-[11px] text-(--color-ink-soft)">
                  {call && (
                    <div>
                      <span className="text-(--color-ink-faint)">tool:</span> {call.tool}({JSON.stringify(call.args)})
                    </div>
                  )}
                  {result && (
                    <div className="break-words">
                      <span className="text-(--color-ink-faint)">result:</span> {result.summary}
                      {result.error && <span className="text-(--color-error)"> ({result.error})</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
