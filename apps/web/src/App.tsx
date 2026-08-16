import { useCallback, useEffect, useRef, useState } from 'react'
import StatusStrip from './components/StatusStrip'
import { streamRun } from './lib/sse'
import Composer from './panes/Composer'
import EvidenceDrawer from './panes/EvidenceDrawer'
import TracePane from './panes/TracePane'
import type { AgentEvent, AgentInfo, SourceRef } from './types/events'

export default function App() {
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('researcher')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [sources, setSources] = useState<Map<number, SourceRef>>(new Map())
  const [running, setRunning] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgentsList)
      .catch(() => setAgentsList([]))
  }, [])

  const handleRun = useCallback(
    async (prompt: string) => {
      setEvents([])
      setSources(new Map())
      setHighlighted(null)
      setRunning(true)
      const controller = new AbortController()
      abortRef.current = controller

      const mergeSources = (refs: SourceRef[]) => {
        if (refs.length === 0) return
        setSources((prev) => {
          const next = new Map(prev)
          for (const s of refs) next.set(s.index, s)
          return next
        })
      }

      try {
        await streamRun(
          prompt,
          selectedAgentId,
          (event) => {
            setEvents((prev) => [...prev, event])
            if (event.type === 'tool_result' || event.type === 'answer_done') mergeSources(event.sources)
          },
          controller.signal,
        )
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setEvents((prev) => [
            ...prev,
            { type: 'error', run_id: 'client', ts: Date.now() / 1000, message: String(e), fatal: true },
          ])
        }
      } finally {
        setRunning(false)
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
        <StatusStrip />
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
        <TracePane events={events} running={running} knownIndices={knownIndices} onCiteClick={handleCiteClick} />
        <EvidenceDrawer sources={Array.from(sources.values())} highlightedIndex={highlighted} />
      </div>
    </div>
  )
}
