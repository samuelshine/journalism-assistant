import { useEffect, useState } from 'react'
import AnswerView from '../components/AnswerView'
import TraceStep from '../components/TraceStep'
import { streamBeatRunNow } from '../lib/sse'
import type { Beat, Brief } from '../types/beats'
import type { AgentEvent } from '../types/events'

function timeAgo(ts: number | null): string {
  if (ts === null) return 'never run'
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
    <div className="mb-4 flex items-center gap-2 rounded border border-(--color-border) bg-(--color-surface) p-3">
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Beat topic, e.g. Tamil Nadu water policy"
        className="flex-1 rounded border border-(--color-border) bg-(--color-ink) px-2 py-1.5 font-(family-name:--font-sans) text-sm text-(--color-paper) placeholder:text-(--color-muted) focus:border-(--color-amber) focus:outline-none"
      />
      <select
        value={interval}
        onChange={(e) => setInterval(Number(e.target.value))}
        className="rounded border border-(--color-border) bg-(--color-ink) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--color-paper)"
      >
        <option value={5}>every 5 min</option>
        <option value={30}>every 30 min</option>
        <option value={60}>every hour</option>
        <option value={360}>every 6 hours</option>
      </select>
      <button
        type="button"
        onClick={() => {
          if (!topic.trim()) return
          onCreate(topic.trim(), interval)
          setTopic('')
        }}
        disabled={!topic.trim()}
        className="rounded bg-(--color-amber) px-3 py-1.5 font-(family-name:--font-mono) text-xs font-medium text-(--color-ink) disabled:opacity-40"
      >
        Add beat
      </button>
    </div>
  )
}

function BeatCard({ beat, onDeleted, onRefresh }: { beat: Beat; onDeleted: () => void; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [running, setRunning] = useState(false)
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([])

  async function loadBriefs() {
    const res = await fetch(`/api/beats/${beat.id}/briefs`)
    setBriefs(await res.json())
  }

  useEffect(() => {
    if (expanded) loadBriefs()
  }, [expanded])

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
  const traceEvents = liveEvents.filter((e) => e.type !== 'answer_done')

  return (
    <div className="mb-2 rounded border border-(--color-border) bg-(--color-surface)">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex-1 text-left">
          <div className="font-(family-name:--font-sans) text-sm font-medium text-(--color-paper)">{beat.topic}</div>
          <div className="font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
            every {beat.interval_minutes}min · {timeAgo(beat.last_run_at)} · {beat.brief_count} brief{beat.brief_count === 1 ? '' : 's'}
          </div>
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="rounded-full border border-(--color-border) px-3 py-1 font-(family-name:--font-mono) text-[11px] text-(--color-muted) hover:border-(--color-muted) disabled:opacity-50"
        >
          {running ? 'running…' : 'Run now'}
        </button>
        <button type="button" onClick={del} className="text-(--color-muted) hover:text-(--color-error)">
          ✕
        </button>
      </div>

      {expanded && (
        <div className="border-t border-(--color-border) px-4 py-3">
          {liveEvents.length > 0 && (
            <div className="mb-3 space-y-0.5">
              {traceEvents.map((e, i) => (
                <TraceStep key={i} event={e} agentsById={{}} />
              ))}
              {answerEvent && answerEvent.type === 'answer_done' && (
                <div className="mt-2 rounded bg-(--color-surface-raised) p-3">
                  <AnswerView text={answerEvent.text} knownIndices={new Set(answerEvent.sources.map((s) => s.index))} onCiteClick={() => {}} />
                </div>
              )}
            </div>
          )}

          {briefs.length === 0 && !running ? (
            <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
              No briefs yet — click "Run now" or wait for the next scheduled check.
            </p>
          ) : (
            <div className="space-y-2">
              {briefs.map((b) => (
                <div key={b.id} className="rounded border border-(--color-border) p-3">
                  <div className="mb-1 font-(family-name:--font-mono) text-[10px] text-(--color-muted)">{timeAgo(b.created_at)}</div>
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
    <div className="flex h-full flex-col overflow-y-auto px-6 py-4 md:px-10">
      <div className="mb-4 font-(family-name:--font-mono) text-xs text-(--color-muted)">
        A beat is a standing topic the desk keeps an eye on — Scout checks it on its own schedule in the
        background, and any brief it finds lands here. Click "Run now" to see it happen immediately instead of
        waiting.
      </div>
      <NewBeatForm onCreate={createBeat} />
      {beats.length === 0 ? (
        <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">No beats yet — add one above.</p>
      ) : (
        beats.map((b) => <BeatCard key={b.id} beat={b} onDeleted={refresh} onRefresh={refresh} />)
      )}
    </div>
  )
}
