import { useCallback, useRef, useState } from 'react'
import AnswerView from '../components/AnswerView'
import TraceStep from '../components/TraceStep'
import { streamHallucinationLab } from '../lib/sse'
import type { AgentEvent, AgentInfo, AnswerDoneEvent, SourceRef } from '../types/events'

const PLACEHOLDER = 'e.g. How severe is the water shortage in Chennai right now, and what is the city doing about it?'

const UNGROUNDED_AGENT: { name: string; color: string } = { name: 'No tools', color: 'agent-factchecker' }
const GROUNDED_AGENT: { name: string; color: string } = { name: 'Researcher, grounded', color: 'agent-researcher' }
const NO_AGENTS: Record<string, AgentInfo> = {}
const RESEARCHER_AGENT_LOOKUP: Record<string, AgentInfo> = {
  researcher: { id: 'researcher', name: 'Researcher', description: '', color: 'agent-researcher', tools: [] },
}

export default function HallucinationLab() {
  const [prompt, setPrompt] = useState('')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async () => {
    if (!prompt.trim() || running) return
    setEvents([])
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    let live: AgentEvent[] = []
    try {
      await streamHallucinationLab(
        prompt.trim(),
        (event) => {
          live = [...live, event]
          setEvents(live)
        },
        controller.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        live = [...live, { type: 'error', run_id: 'client', ts: Date.now() / 1000, message: String(e), fatal: true }]
        setEvents(live)
      }
    } finally {
      setRunning(false)
    }
  }, [prompt, running])

  const ungroundedEvents = events.filter((e) => 'agent' in e && e.agent === 'ungrounded' && e.type !== 'answer_done')
  const groundedEvents = events.filter((e) => 'agent' in e && e.agent !== 'ungrounded' && e.type !== 'answer_done')
  const ungroundedAnswer = events.find((e) => e.type === 'answer_done' && e.agent === 'ungrounded') as AnswerDoneEvent | undefined
  const groundedAnswer = events.find((e) => e.type === 'answer_done' && e.agent === 'researcher') as AnswerDoneEvent | undefined

  const groundedSources = new Map<number, SourceRef>()
  for (const e of events) {
    if ((e.type === 'tool_result' || e.type === 'answer_done') && e.agent !== 'ungrounded') {
      for (const s of e.sources) groundedSources.set(s.index, s)
    }
  }
  const knownIndices = new Set(groundedSources.keys())

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-4 md:px-10">
      <div className="mb-4 rounded border border-dashed border-(--color-border) px-4 py-3 font-(family-name:--font-mono) text-xs text-(--color-muted)">
        🧪 Ask the same question two ways: once with no tools at all — just the model's training data — and once
        through the Researcher, with live sources and citations. Compare what's confident-sounding against what's
        actually checkable.
      </div>

      <div className="mb-4 flex items-end gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              run()
            }
          }}
          placeholder={PLACEHOLDER}
          rows={2}
          disabled={running}
          className="flex-1 resize-none rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 font-(family-name:--font-sans) text-sm text-(--color-paper) placeholder:text-(--color-muted) focus:border-(--color-amber) focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={running ? () => abortRef.current?.abort() : run}
          disabled={!running && !prompt.trim()}
          className={`shrink-0 rounded px-4 py-2 font-(family-name:--font-mono) text-xs font-medium disabled:opacity-40 ${
            running ? 'border border-(--color-error) text-(--color-error)' : 'bg-(--color-amber) text-(--color-ink)'
          }`}
        >
          {running ? 'Stop' : 'Compare'}
        </button>
      </div>

      {events.length > 0 && (
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          {[
            { info: UNGROUNDED_AGENT, trace: ungroundedEvents, answer: ungroundedAnswer, agentsById: NO_AGENTS },
            { info: GROUNDED_AGENT, trace: groundedEvents, answer: groundedAnswer, agentsById: RESEARCHER_AGENT_LOOKUP },
          ].map((lane, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded border border-(--color-border) bg-(--color-surface)">
              <div
                className="border-b border-(--color-border) px-4 py-2 font-(family-name:--font-mono) text-[10px] uppercase tracking-widest"
                style={{ borderLeft: `3px solid var(--color-${lane.info.color})`, color: `var(--color-${lane.info.color})` }}
              >
                {lane.info.name}
              </div>
              <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
                {lane.trace.map((e, j) => (
                  <TraceStep key={j} event={e} agentsById={lane.agentsById} />
                ))}
                {lane.answer && (
                  <div className="mt-3 border-t border-(--color-border) pt-3">
                    <AnswerView text={lane.answer.text} knownIndices={knownIndices} onCiteClick={() => {}} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
