import type { PullQuote, TranscriptReadyEvent, TranscriptSegment } from '../types/events'

const SPEAKER_COLOR: Record<string, string> = {
  'Speaker A': 'var(--color-amber)',
  'Speaker B': 'var(--color-agent-interviewer)',
}

function speakerColor(speaker: string): string {
  return SPEAKER_COLOR[speaker] ?? 'var(--color-muted)'
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function segmentId(start: number): string {
  return `segment-${start.toFixed(2)}`
}

function PullQuoteCard({ quote, onClick }: { quote: PullQuote; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded border border-(--color-border) bg-(--color-surface-raised) px-4 py-3 text-left transition-colors hover:border-(--color-muted)"
    >
      <p className="font-(family-name:--font-serif) text-[15px] italic leading-snug text-(--color-paper)">“{quote.text}”</p>
      <div className="mt-2 flex items-center gap-2 font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: speakerColor(quote.speaker) }} />
        {quote.speaker} · {formatTimestamp(quote.start)}
      </div>
    </button>
  )
}

function SegmentRow({ segment }: { segment: TranscriptSegment }) {
  return (
    <div id={segmentId(segment.start)} className="flex gap-3 rounded px-2 py-1.5 target:bg-(--color-surface-raised)">
      <span className="w-12 shrink-0 pt-0.5 font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
        {formatTimestamp(segment.start)}
      </span>
      <span
        className="w-20 shrink-0 pt-0.5 font-(family-name:--font-mono) text-[10px] font-medium"
        style={{ color: speakerColor(segment.speaker) }}
      >
        {segment.speaker}
      </span>
      <p className="flex-1 font-(family-name:--font-serif) text-sm leading-relaxed text-(--color-paper)">{segment.text}</p>
    </div>
  )
}

export default function TranscriptView({ transcript }: { transcript: TranscriptReadyEvent }) {
  function jumpTo(start: number) {
    document.getElementById(segmentId(start))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-(family-name:--font-sans) text-sm font-medium text-(--color-paper)">{transcript.title}</div>
          <div className="font-(family-name:--font-mono) text-[11px] text-(--color-muted)">
            {transcript.language} · {formatTimestamp(transcript.duration)} · {transcript.segments.length} segments
          </div>
        </div>
      </div>

      <div className="mb-2 rounded border border-dashed border-(--color-border) px-3 py-2 font-(family-name:--font-mono) text-[11px] text-(--color-muted)">
        ⓘ {transcript.speaker_note}
      </div>

      {transcript.pull_quotes.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
            Pull quotes
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {transcript.pull_quotes.map((q, i) => (
              <PullQuoteCard key={i} quote={q} onClick={() => jumpTo(q.start)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
          Full transcript
        </div>
        <div className="space-y-0.5">
          {transcript.segments.map((s, i) => (
            <SegmentRow key={i} segment={s} />
          ))}
        </div>
      </div>
    </div>
  )
}
