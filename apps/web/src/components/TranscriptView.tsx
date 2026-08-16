import type { PullQuote, TranscriptReadyEvent, TranscriptSegment } from '../types/events'

const SPEAKER_COLOR: Record<string, string> = {
  'Speaker A': 'var(--color-masthead)',
  'Speaker B': 'var(--color-agent-interviewer)',
}

function speakerColor(speaker: string): string {
  return SPEAKER_COLOR[speaker] ?? 'var(--color-ink-faint)'
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
      className="block w-full rounded-sm border border-(--color-rule) bg-(--color-paper-sunken) px-4 py-3 text-left transition-colors hover:border-(--color-ink-faint)"
    >
      <p className="font-(family-name:--font-display) text-[16px] leading-snug text-(--color-ink) italic">“{quote.text}”</p>
      <div className="mt-2 flex items-center gap-2 font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: speakerColor(quote.speaker) }} />
        {quote.speaker} · {formatTimestamp(quote.start)}
      </div>
    </button>
  )
}

function SegmentRow({ segment }: { segment: TranscriptSegment }) {
  return (
    <div id={segmentId(segment.start)} className="flex gap-3 rounded-sm px-2 py-1.5 target:bg-(--color-highlight)/40">
      <span className="w-10 shrink-0 pt-0.5 font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">
        {formatTimestamp(segment.start)}
      </span>
      <span
        className="w-[74px] shrink-0 pt-0.5 font-(family-name:--font-sans) text-[10.5px] font-semibold"
        style={{ color: speakerColor(segment.speaker) }}
      >
        {segment.speaker}
      </span>
      <p className="flex-1 font-(family-name:--font-serif) text-[14.5px] leading-relaxed text-(--color-ink)">{segment.text}</p>
    </div>
  )
}

export default function TranscriptView({ transcript }: { transcript: TranscriptReadyEvent }) {
  function jumpTo(start: number) {
    document.getElementById(segmentId(start))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div>
      <div className="mb-4">
        <div className="font-(family-name:--font-display) text-[17px] text-(--color-ink)">{transcript.title}</div>
        <div className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">
          {transcript.language} · {formatTimestamp(transcript.duration)} long · {transcript.segments.length} moments
        </div>
      </div>

      <div className="mb-4 rounded-sm border border-dashed border-(--color-rule-strong) px-3.5 py-2.5 font-(family-name:--font-serif) text-[12.5px] text-(--color-ink-soft) italic">
        ⓘ {transcript.speaker_note}
      </div>

      {transcript.pull_quotes.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 font-(family-name:--font-sans) text-[11px] font-semibold tracking-wide text-(--color-masthead) uppercase">
            Worth quoting
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {transcript.pull_quotes.map((q, i) => (
              <PullQuoteCard key={i} quote={q} onClick={() => jumpTo(q.start)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 font-(family-name:--font-sans) text-[11px] font-semibold tracking-wide text-(--color-masthead) uppercase">
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
