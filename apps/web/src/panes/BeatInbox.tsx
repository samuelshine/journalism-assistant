import { useCallback, useEffect, useState } from 'react'
import AnswerView from '../components/AnswerView'
import NotebookEntry from '../components/NotebookEntry'
import { buildNotebook } from '../lib/notebook'
import { streamBeatRunNow } from '../lib/sse'
import type { Beat, Brief } from '../types/beats'
import type { AgentEvent } from '../types/events'

function timeAgo(ts: number | null): string {
  if (ts === null) return 'never checked yet'
  const seconds = Math.round((Date.now() / 1000 - ts))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function NewBeatForm({ onCreate }: { onCreate: (topic: string, interval: number) => void }) {
  const [topic, setTopic] = useState('')
  const [interval, setInterval] = useState(30)
  return (
    <div className="mb-5 flex items-center gap-2 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) p-3.5">
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="A topic to keep an eye on, e.g. Tamil Nadu water policy"
        className="flex-1 rounded-sm border border-(--color-rule) bg-(--color-paper) px-2.5 py-1.5 font-(family-name:--font-serif) text-[14px] text-(--color-ink) placeholder:text-(--color-ink-faint) placeholder:italic focus:border-(--color-masthead) focus:outline-none"
      />
      <select
        value={interval}
        onChange={(e) => setInterval(Number(e.target.value))}
        className="rounded-sm border border-(--color-rule) bg-(--color-paper) px-2 py-1.5 font-(family-name:--font-sans) text-[12.5px] text-(--color-ink)"
      >
        <option value={5}>check every 5 min</option>
        <option value={30}>check every 30 min</option>
        <option value={60}>check every hour</option>
        <option value={360}>check every 6 hours</option>
      </select>
      <button
        type="button"
        onClick={() => {
          if (!topic.trim()) return
          onCreate(topic.trim(), interval)
          setTopic('')
        }}
        disabled={!topic.trim()}
        className="rounded-sm bg-(--color-masthead) px-3.5 py-1.5 font-(family-name:--font-sans) text-[12.5px] font-medium text-(--color-paper-raised) disabled:opacity-40"
      >
        Add to the beat sheet
      </button>
    </div>
  )
}

function BeatCard({ beat, onDeleted, onRefresh }: { beat: Beat; onDeleted: () => void; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [running, setRunning] = useState(false)
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([])

  const loadBriefs = useCallback(async () => {
    const res = await fetch(`/api/beats/${beat.id}/briefs`)
    setBriefs(await res.json())
  }, [beat.id])

  useEffect(() => {
    if (expanded) loadBriefs()
  }, [expanded, loadBriefs])

  async function runNow() {
    setRunning(true)
    setLiveEvents([])
    setExpanded(true)
    let live: AgentEvent[] = []
    try {
      await streamBeatRunNow(beat.id, (event) => {
        live = [...live, event]
        setLiveEvents(live)
      })
    } finally {
      setRunning(false)
      await loadBriefs()
      onRefresh()
    }
  }

  async function del() {
    await fetch(`/api/beats/${beat.id}`, { method: 'DELETE' })
    onDeleted()
  }

  const answerEvent = liveEvents.find((e) => e.type === 'answer_done')
  const notebook = buildNotebook(liveEvents)

  return (
    <div className="mb-2.5 rounded-sm border border-(--color-rule) bg-(--color-paper-raised)">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex-1 text-left">
          <div className="font-(family-name:--font-serif) text-[15px] text-(--color-ink)">{beat.topic}</div>
          <div className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">
            checked every {beat.interval_minutes}min · {timeAgo(beat.last_run_at)} · {beat.brief_count} note{beat.brief_count === 1 ? '' : 's'} so far
          </div>
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-full border border-(--color-rule) px-3 py-1 font-(family-name:--font-sans) text-[11.5px] text-(--color-ink-soft) hover:border-(--color-ink-faint) disabled:opacity-50"
        >
          {running ? 'checking…' : 'Check now'}
        </button>
        <button type="button" onClick={del} className="text-(--color-ink-faint) hover:text-(--color-error)">
          ✕
        </button>
      </div>

      {expanded && (
        <div className="border-t border-(--color-rule) px-4 py-3.5">
          {liveEvents.length > 0 && (
            <div className="mb-3 divide-y divide-(--color-rule)/60">
              {notebook.map((entry) => (
                <NotebookEntry key={entry.key} entry={entry} agentsById={{}} />
              ))}
              {answerEvent && answerEvent.type === 'answer_done' && (
                <div className="mt-2 rounded-sm bg-(--color-paper-sunken) p-3">
                  <AnswerView text={answerEvent.text} knownIndices={new Set(answerEvent.sources.map((s) => s.index))} onCiteClick={() => {}} />
                </div>
              )}
            </div>
          )}

          {briefs.length === 0 && !running ? (
            <p className="font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">
              No notes yet — click "Check now," or wait for the next scheduled check.
            </p>
          ) : (
            <div className="space-y-2">
              {briefs.map((b) => (
                <div key={b.id} className="rounded-sm border border-(--color-rule) p-3">
                  <div className="mb-1 font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">{timeAgo(b.created_at)}</div>
                  <AnswerView text={b.text} knownIndices={new Set(b.sources.map((s) => s.index))} onCiteClick={() => {}} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BeatInbox() {
  const [beats, setBeats] = useState<Beat[]>([])

  async function refresh() {
    const res = await fetch('/api/beats')
    setBeats(await res.json())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function createBeat(topic: string, interval: number) {
    await fetch('/api/beats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, interval_minutes: interval }),
    })
    refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-5 md:px-10">
      <div className="mb-2 font-(family-name:--font-display) text-lg text-(--color-ink)">The beat sheet</div>
      <p className="mb-4 max-w-2xl font-(family-name:--font-serif) text-[14px] text-(--color-ink-soft)">
        Add a topic here and the desk keeps an eye on it in the background, on its own schedule — the way a reporter
        holds a beat. Whatever it finds shows up below. "Check now" runs it immediately, live, instead of waiting.
      </p>
      <NewBeatForm onCreate={createBeat} />
      {beats.length === 0 ? (
        <p className="font-(family-name:--font-serif) text-[13.5px] text-(--color-ink-faint) italic">Nothing on the beat sheet yet — add a topic above.</p>
      ) : (
        beats.map((b) => <BeatCard key={b.id} beat={b} onDeleted={refresh} onRefresh={refresh} />)
      )}
    </div>
  )
}
