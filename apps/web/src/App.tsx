import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StatusStrip from './components/StatusStrip'
import { streamCrew, streamRun } from './lib/sse'
import BeatInbox from './panes/BeatInbox'
import Composer from './panes/Composer'
import Draft from './panes/Draft'
import EvidenceDrawer from './panes/EvidenceDrawer'
import HallucinationLab from './panes/HallucinationLab'
import StoryDesk from './panes/StoryDesk'
import Studio from './panes/Studio'
import TracePane from './panes/TracePane'
import type { AgentEvent, AgentInfo, SourceRef } from './types/events'
import type { RunHistoryEntry } from './types/history'

type Tab = 'desk' | 'draft' | 'studio' | 'lab' | 'beats'

const TAB_LABEL: Record<Tab, string> = {
  desk: 'The Desk',
  draft: 'Draft',
  studio: 'Studio',
  lab: 'Compare',
  beats: 'Beats',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('desk')
  const [presenter, setPresenter] = useState(false)
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('researcher')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [sources, setSources] = useState<Map<number, SourceRef>>(new Map())
  const [running, setRunning] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [history, setHistory] = useState<RunHistoryEntry[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgentsList)
      .catch(() => setAgentsList([]))
  }, [])

  const agentsById = useMemo(() => Object.fromEntries(agentsList.map((a) => [a.id, a])), [agentsList])

  const handleRun = useCallback(
    async (prompt: string, agentOverride?: string) => {
      const entryId = crypto.randomUUID()
      const agentAtStart = agentOverride ?? selectedAgentId
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
    setTab('desk')
  }

  // From Studio: "send this transcript to Fact-Checker/Interviewer" — sets
  // the agent explicitly rather than relying on selectedAgentId, since
  // setSelectedAgentId + handleRun in the same tick would otherwise race
  // React's state batching and run against the *previous* agent.
  function handleSendToAgent(agentId: string, prompt: string) {
    setSelectedAgentId(agentId)
    setTab('desk')
    handleRun(prompt, agentId)
  }

  // From TracePane: "Open in Draft workspace" on a finished answer —
  // persists it server-side as an editable Article, then switches to the
  // Draft tab with it loaded.
  async function handlePromoteToDraft(title: string, body: string, articleSources: SourceRef[], originRunId: string | null) {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body_markdown: body, sources: articleSources, origin_run_id: originRunId }),
    })
    if (!res.ok) return
    const article = await res.json()
    setActiveArticleId(article.id)
    setTab('draft')
  }

  const knownIndices = new Set(sources.keys())
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div data-presenter={presenter} className="flex h-screen flex-col bg-(--color-paper) text-(--color-ink)">
      <header className="border-b-[3px] border-(--color-masthead) bg-(--color-paper-raised) px-6 pt-4 pb-0 md:px-10">
        <div className="flex items-start justify-between pb-3">
          <div>
            <h1 className="font-(family-name:--font-display) text-[32px] leading-none font-semibold tracking-tight text-(--color-ink)">
              NEWSROOM
            </h1>
            <p className="mt-1 font-(family-name:--font-serif) text-[12.5px] text-(--color-ink-faint) italic">
              an AI newsroom desk, for reporters still learning the ropes · {today}
            </p>
          </div>
          <div className="flex items-center gap-4 pt-1.5">
            <button
              type="button"
              onClick={() => setPresenter((v) => !v)}
              title="Bigger type, for projecting to a classroom"
              className={`font-(family-name:--font-sans) text-[11px] ${presenter ? 'text-(--color-masthead)' : 'text-(--color-ink-faint) hover:text-(--color-ink)'}`}
            >
              {presenter ? '↙ smaller' : '↗ bigger type'}
            </button>
            <button
              type="button"
              onClick={() => setDeskOpen(true)}
              className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint) hover:text-(--color-ink)"
            >
              Story Desk{history.length > 0 ? ` (${history.length})` : ''}
            </button>
            <StatusStrip />
          </div>
        </div>
        <nav className="flex gap-5">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 pb-2.5 font-(family-name:--font-sans) text-[13px] font-medium transition-colors ${
                tab === t
                  ? 'border-(--color-masthead) text-(--color-ink)'
                  : 'border-transparent text-(--color-ink-faint) hover:text-(--color-ink)'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'desk' && (
        <>
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
              onPromoteToDraft={handlePromoteToDraft}
            />
            <EvidenceDrawer sources={Array.from(sources.values())} highlightedIndex={highlighted} />
          </div>
        </>
      )}
      {tab === 'draft' && (
        <Draft
          activeArticleId={activeArticleId}
          onActiveArticleHandled={() => setActiveArticleId(null)}
          agentsById={agentsById}
        />
      )}
      {tab === 'studio' && (
        <div className="min-h-0 flex-1">
          <Studio onSendToAgent={handleSendToAgent} />
        </div>
      )}
      {tab === 'lab' && (
        <div className="min-h-0 flex-1">
          <HallucinationLab />
        </div>
      )}
      {tab === 'beats' && (
        <div className="min-h-0 flex-1">
          <BeatInbox />
        </div>
      )}

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
