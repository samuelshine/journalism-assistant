import { useEffect, useRef } from 'react'
import type { AgentEvent } from '../types/events'
import AnswerView from '../components/AnswerView'
import TraceStep from '../components/TraceStep'

interface Props {
  events: AgentEvent[]
  running: boolean
  knownIndices: Set<number>
  onCiteClick: (index: number) => void
}

export default function TracePane({ events, running, knownIndices, onCiteClick }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [events.length])

  const answerEvent = events.find((e) => e.type === 'answer_done')
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
          <TraceStep key={i} event={e} />
        ))}
      </div>

      {running && !answerEvent && (
        <div className="flex items-center gap-2 py-2 font-(family-name:--font-mono) text-xs text-(--color-muted)">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-amber)" />
          working…
        </div>
      )}

      {answerEvent && answerEvent.type === 'answer_done' && (
        <div className="mt-4 rounded border border-(--color-border) bg-(--color-surface) p-5">
          <div className="mb-3 font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
            Answer
          </div>
          <AnswerView text={answerEvent.text} knownIndices={knownIndices} onCiteClick={onCiteClick} />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
