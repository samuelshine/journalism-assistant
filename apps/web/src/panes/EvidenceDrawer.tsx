import type { SourceRef } from '../types/events'
import SourceCard from '../components/SourceCard'

interface Props {
  sources: SourceRef[]
  highlightedIndex: number | null
}

export default function EvidenceDrawer({ sources, highlightedIndex }: Props) {
  return (
    <div className="flex h-full flex-col border-l border-(--color-rule) bg-(--color-paper-sunken)">
      <div className="flex items-center justify-between border-b border-(--color-rule) px-4 py-3">
        <span className="font-(family-name:--font-display) text-[15px] text-(--color-ink)">Sources</span>
        <span className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">{sources.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {sources.length === 0 ? (
          <p className="px-1 font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">
            Every source the desk finds lands here, with a live link — click a footnote number in the copy to jump to it.
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
