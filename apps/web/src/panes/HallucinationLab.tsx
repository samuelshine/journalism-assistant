import { useCallback, useRef, useState } from 'react'
import AnswerView from '../components/AnswerView'
import NotebookEntry from '../components/NotebookEntry'
import { buildNotebook } from '../lib/notebook'
import { streamHallucinationLab } from '../lib/sse'
import type { AgentEvent, AgentInfo, AnswerDoneEvent, SourceRef } from '../types/events'

const PLACEHOLDER = 'e.g. How severe is the water shortage in Chennai right now, and what is the city doing about it?'

const UNGROUNDED_LANE = { title: 'Straight off the top of its head', subtitle: 'no research, just what it already "knows"', color: 'agent-factchecker' }
const GROUNDED_LANE = { title: 'After actually checking', subtitle: 'the Researcher, with live sources', color: 'agent-researcher' }
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
    <div className="flex h-full flex-col overflow-y-auto px-6 py-5 md:px-10">
      <div className="mb-4 font-(family-name:--font-display) text-lg text-(--color-ink)">Compare: guessing vs. checking</div>
      <p className="mb-4 max-w-2xl font-(family-name:--font-serif) text-[14px] text-(--color-ink-soft)">
        Ask the same question two ways at once — one answer straight from the AI's memory, no lookups at all, and one
        from the Researcher, who actually goes and checks. This is the whole reason a desk like this beats a plain
        chatbot: you can see which claims are backed by something real.
      </p>

      <div className="mb-5 flex items-end gap-3">
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
          className="flex-1 resize-none rounded-sm border border-(--color-rule) bg-(--color-paper-raised) px-3.5 py-2.5 font-(family-name:--font-serif) text-[15px] text-(--color-ink) placeholder:text-(--color-ink-faint) placeholder:italic focus:border-(--color-masthead) focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={running ? () => abortRef.current?.abort() : run}
          disabled={!running && !prompt.trim()}
          className={`shrink-0 rounded-sm px-5 py-2.5 font-(family-name:--font-sans) text-sm font-medium disabled:opacity-40 ${
            running ? 'border border-(--color-error) text-(--color-error)' : 'bg-(--color-masthead) text-(--color-paper-raised)'
          }`}
        >
          {running ? 'Stop' : 'Compare →'}
        </button>
      </div>

      {events.length > 0 && (
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          {[
            { info: UNGROUNDED_LANE, trace: ungroundedEvents, answer: ungroundedAnswer, agentsById: NO_AGENTS },
            { info: GROUNDED_LANE, trace: groundedEvents, answer: groundedAnswer, agentsById: RESEARCHER_AGENT_LOOKUP },
          ].map((lane, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-sm border border-(--color-rule) bg-(--color-paper-raised)">
              <div className="border-b border-(--color-rule) px-4 py-2.5" style={{ borderLeft: `3px solid var(--color-${lane.info.color})` }}>
                <div className="font-(family-name:--font-display) text-[15px] text-(--color-ink)">{lane.info.title}</div>
                <div className="font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">{lane.info.subtitle}</div>
              </div>
              <div className="flex-1 divide-y divide-(--color-rule)/60 overflow-y-auto px-3.5 py-2">
                {buildNotebook(lane.trace).map((entry) => (
                  <NotebookEntry key={entry.key} entry={entry} agentsById={lane.agentsById} />
                ))}
                {lane.answer && (
                  <div className="border-t-0 pt-3">
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
