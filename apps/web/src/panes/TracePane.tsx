import { useEffect, useRef } from 'react'
import type { AgentEvent, AgentInfo } from '../types/events'
import AnswerView from '../components/AnswerView'
import TraceStep from '../components/TraceStep'

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
  // Ethicist, …) — each renders as its own card, in order, so the reader
  // can see the pipeline's work build up rather than only the final output.
  const answerEvents = events.filter((e) => e.type === 'answer_done')
  const traceEvents = events.filter((e) => e.type !== 'answer_done')

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-4 md:px-10">
      {traceEvents.length === 0 && !running && (
        <div className="flex flex-1 items-center justify-center font-(family-name:--font-mono) text-sm text-(--color-muted)">
          Trace will appear here — every plan, tool call, and result, live.
        </div>
      )}

      <div className="space-y-0.5">
        {traceEvents.map((e, i) => (
          <TraceStep key={i} event={e} agentsById={agentsById} />
        ))}
      </div>

      {running && (
        <div className="flex items-center gap-2 py-2 font-(family-name:--font-mono) text-xs text-(--color-muted)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-amber)" />
          working…
        </div>
      )}

      {answerEvents.map((answerEvent, i) => {
        if (answerEvent.type !== 'answer_done') return null
        const info = agentsById[answerEvent.agent]
        return (
          <div key={i} className="mt-4 overflow-hidden rounded border border-(--color-border) bg-(--color-surface)">
            <div
              className="flex items-center gap-2 border-b border-(--color-border) px-5 py-2.5"
              style={info ? { borderLeft: `3px solid var(--color-${info.color})` } : undefined}
            >
              <span className="font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
                {info?.name ?? answerEvent.agent}
              </span>
            </div>
            <div className="p-5">
              <AnswerView text={answerEvent.text} knownIndices={knownIndices} onCiteClick={onCiteClick} />
            </div>
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
