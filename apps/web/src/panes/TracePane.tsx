import { useEffect, useRef } from 'react'
import AnswerView from '../components/AnswerView'
import NotebookEntry from '../components/NotebookEntry'
import { buildNotebook } from '../lib/notebook'
import type { AgentEvent, AgentInfo } from '../types/events'

interface Props {
  events: AgentEvent[]
  running: boolean
  knownIndices: Set<number>
  onCiteClick: (index: number) => void
  agentsById: Record<string, AgentInfo>
}

export default function TracePane({ events, running, knownIndices, onCiteClick, agentsById }: Props) {
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
        return (
          <div key={i} className="mt-5 overflow-hidden rounded-sm border border-(--color-rule) bg-(--color-paper-raised)">
            <div className="border-b-2 border-(--color-masthead) px-6 py-2.5" style={info ? { borderLeftColor: `var(--color-${info.color})`, borderLeftWidth: 3 } : undefined}>
              <span className="font-(family-name:--font-sans) text-[11px] font-semibold tracking-[0.1em] text-(--color-ink-faint) uppercase">
                {info?.name ?? answerEvent.agent}'s copy
              </span>
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
