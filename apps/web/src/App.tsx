import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StatusStrip from './components/StatusStrip'
import { streamCrew, streamRun } from './lib/sse'
import Composer from './panes/Composer'
import EvidenceDrawer from './panes/EvidenceDrawer'
import StoryDesk from './panes/StoryDesk'
import TracePane from './panes/TracePane'
import type { AgentEvent, AgentInfo, SourceRef } from './types/events'
import type { RunHistoryEntry } from './types/history'

export default function App() {
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('researcher')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [sources, setSources] = useState<Map<number, SourceRef>>(new Map())
  const [running, setRunning] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [history, setHistory] = useState<RunHistoryEntry[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgentsList)
      .catch(() => setAgentsList([]))
  }, [])

  const agentsById = useMemo(() => Object.fromEntries(agentsList.map((a) => [a.id, a])), [agentsList])

  const handleRun = useCallback(
    async (prompt: string) => {
      const entryId = crypto.randomUUID()
      const agentAtStart = selectedAgentId
      setActiveEntryId(entryId)
      setEvents([])
      setSources(new Map())
      setHighlighted(null)
      setRunning(true)
      const controller = new AbortController()
      abortRef.current = controller

      let liveEvents: AgentEvent[] = []
      const mergeSources = (refs: SourceRef[]) => {
        if (refs.length === 0) return
        setSources((prev) => {
          const next = new Map(prev)
          for (const s of refs) next.set(s.index, s)
          return next
        })
      }
      const onEvent = (event: AgentEvent) => {
        liveEvents = [...liveEvents, event]
        setEvents(liveEvents)
        if (event.type === 'tool_result' || event.type === 'answer_done') mergeSources(event.sources)
      }

      try {
        if (agentAtStart === 'desk_chief') {
          await streamCrew(prompt, onEvent, controller.signal)
        } else {
          await streamRun(prompt, agentAtStart, onEvent, controller.signal)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          const errEvent: AgentEvent = { type: 'error', run_id: 'client', ts: Date.now() / 1000, message: String(e), fatal: true }
          liveEvents = [...liveEvents, errEvent]
          setEvents(liveEvents)
        }
      } finally {
        setRunning(false)
        setHistory((prev) => [
          ...prev,
          { id: entryId, prompt, agentId: agentAtStart, startedAt: Date.now(), events: liveEvents, sources: [] },
        ])
      }
    },
    [selectedAgentId],
  )

  function handleStop() {
    abortRef.current?.abort()
    setRunning(false)
  }

  function handleCiteClick(index: number) {
    setHighlighted(index)
    document.getElementById(`source-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setHighlighted((h) => (h === index ? null : h)), 2500)
  }

  function handleSelectHistory(entry: RunHistoryEntry) {
    setActiveEntryId(entry.id)
    setEvents(entry.events)
    const map = new Map<number, SourceRef>()
    for (const e of entry.events) {
      if (e.type === 'tool_result' || e.type === 'answer_done') {
        for (const s of e.sources) map.set(s.index, s)
      }
    }
    setSources(map)
    setSelectedAgentId(entry.agentId)
    setDeskOpen(false)
  }

  const knownIndices = new Set(sources.keys())

  return (
    <div className="flex h-screen flex-col bg-(--color-ink) text-(--color-paper)">
      <header className="flex items-center justify-between border-b border-(--color-border) px-6 py-3 md:px-10">
        <div className="flex items-baseline gap-3">
          <h1 className="font-(family-name:--font-serif) text-2xl italic tracking-tight">NEWSROOM</h1>
          <span className="font-(family-name:--font-mono) text-[10px] uppercase tracking-[0.2em] text-(--color-amber)">
            agentic desk
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setDeskOpen(true)}
            className="font-(family-name:--font-mono) text-[11px] text-(--color-muted) hover:text-(--color-paper)"
          >
            Story Desk{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <StatusStrip />
        </div>
      </header>

      <Composer
        agentsList={agentsList}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        running={running}
        onRun={handleRun}
        onStop={handleStop}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_320px]">
        <TracePane
          events={events}
          running={running}
          knownIndices={knownIndices}
          onCiteClick={handleCiteClick}
          agentsById={agentsById}
        />
        <EvidenceDrawer sources={Array.from(sources.values())} highlightedIndex={highlighted} />
      </div>

      <StoryDesk
        open={deskOpen}
        onClose={() => setDeskOpen(false)}
        history={history}
        agentsById={agentsById}
        onSelect={handleSelectHistory}
        activeId={activeEntryId}
      />
    </div>
  )
}
