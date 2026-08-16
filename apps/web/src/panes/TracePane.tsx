import { useEffect, useRef } from 'react'
import AnswerView from '../components/AnswerView'
import NotebookEntry from '../components/NotebookEntry'
import { buildNotebook } from '../lib/notebook'
import type { AgentEvent, AgentInfo, SourceRef } from '../types/events'

// Fact-Checker verdicts and Ethicist reviews are judgements about a piece
// of writing, not a piece of writing themselves — no "open in Draft
// workspace" button on those.
const NON_ARTICLE_AGENTS = new Set(['factchecker', 'ethicist'])

function deriveTitle(text: string): string {
  const headerMatch = text.match(/^#{1,4}\s+(.+)$/m)
  if (headerMatch) return headerMatch[1].trim()
  const firstLine = text.split(/\n+/).find((l) => l.trim())?.trim() ?? ''
  const plain = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '')
  return plain.length > 70 ? `${plain.slice(0, 69)}…` : plain || 'Untitled draft'
}

interface Props {
  events: AgentEvent[]
  running: boolean
  knownIndices: Set<number>
  onCiteClick: (index: number) => void
  agentsById: Record<string, AgentInfo>
  onPromoteToDraft?: (title: string, body: string, sources: SourceRef[], originRunId: string | null) => void
}

export default function TracePane({ events, running, knownIndices, onCiteClick, agentsById, onPromoteToDraft }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [events.length])

  // A crew run produces one answer per stage (Researcher, then Editor, then
  // Ethicist, …) — each renders as its own typeset piece, in order, so the
  // reader can see the story build up rather than only the final output.
  const answerEvents = events.filter((e) => e.type === 'answer_done')
  const notebook = buildNotebook(events)

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-5 md:px-10">
      {notebook.length === 0 && !running && (
        <div className="flex flex-1 items-center justify-center text-center font-(family-name:--font-serif) text-[15px] text-(--color-ink-faint) italic">
          Ask the desk something above, and watch the reporting happen here — step by step, nothing hidden.
        </div>
      )}

      {notebook.length > 0 && (
        <div className="mb-1 font-(family-name:--font-sans) text-[11px] font-semibold tracking-[0.08em] text-(--color-ink-faint) uppercase">
          Reporting notes
        </div>
      )}
      <div className="divide-y divide-(--color-rule)/60">
        {notebook.map((entry) => (
          <NotebookEntry key={entry.key} entry={entry} agentsById={agentsById} />
        ))}
      </div>

      {running && (
        <div className="flex items-center gap-2 py-3 font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-masthead)" />
          still working…
        </div>
      )}

      {answerEvents.map((answerEvent, i) => {
        if (answerEvent.type !== 'answer_done') return null
        const info = agentsById[answerEvent.agent]
        const canPromote = onPromoteToDraft && !NON_ARTICLE_AGENTS.has(answerEvent.agent)
        return (
          <div key={i} className="mt-5 overflow-hidden rounded-sm border border-(--color-rule) bg-(--color-paper-raised)">
            <div
              className="flex items-center justify-between border-b-2 border-(--color-masthead) px-6 py-2.5"
              style={info ? { borderLeftColor: `var(--color-${info.color})`, borderLeftWidth: 3 } : undefined}
            >
              <span className="font-(family-name:--font-sans) text-[11px] font-semibold tracking-[0.1em] text-(--color-ink-faint) uppercase">
                {info?.name ?? answerEvent.agent}'s copy
              </span>
              {canPromote && (
                <button
                  type="button"
                  onClick={() =>
                    onPromoteToDraft!(deriveTitle(answerEvent.text), answerEvent.text, answerEvent.sources, answerEvent.run_id || null)
                  }
                  className="font-(family-name:--font-sans) text-[11px] font-medium text-(--color-masthead) hover:underline"
                >
                  Open in Draft workspace →
                </button>
              )}
            </div>
            <div className="px-6 py-5">
              <AnswerView text={answerEvent.text} knownIndices={knownIndices} onCiteClick={onCiteClick} />
            </div>
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
