import type { SourceRef } from '../types/events'
import SourceCard from '../components/SourceCard'

interface Props {
  sources: SourceRef[]
  highlightedIndex: number | null
}

export default function EvidenceDrawer({ sources, highlightedIndex }: Props) {
  return (
    <div className="flex h-full flex-col border-l border-(--color-border) bg-(--color-surface)">
      <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
        <span className="font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
          Evidence
        </span>
        <span className="font-(family-name:--font-mono) text-[10px] text-(--color-muted)">{sources.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {sources.length === 0 ? (
          <p className="px-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">
            Sources land here as the agent finds them, each with a live link and retrieval time.
          </p>
        ) : (
          sources
            .sort((a, b) => a.index - b.index)
            .map((s) => <SourceCard key={s.index} source={s} highlighted={s.index === highlightedIndex} />)
        )}
      </div>
    </div>
  )
}
