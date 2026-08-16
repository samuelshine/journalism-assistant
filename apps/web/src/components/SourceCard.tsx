import type { SourceRef } from '../types/events'

interface Props {
  source: SourceRef
  highlighted?: boolean
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function SourceCard({ source, highlighted }: Props) {
  return (
    <a
      href={source.url || undefined}
      target="_blank"
      rel="noreferrer"
      id={`source-${source.index}`}
      className={`block rounded border px-3 py-2 transition-colors ${
        highlighted
          ? 'border-(--color-amber) bg-(--color-surface-raised)'
          : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-muted)'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-(--color-surface-raised) px-1.5 font-(family-name:--font-mono) text-[10px] text-(--color-amber)">
          {source.index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-(--color-paper)">{source.title}</div>
          {source.snippet && (
            <div className="mt-0.5 line-clamp-2 text-xs text-(--color-muted)">{source.snippet}</div>
          )}
          <div className="mt-1 flex items-center gap-2 font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
            <span>{source.url ? hostname(source.url) : source.tool}</span>
            {source.published_at && <span>· {source.published_at}</span>}
          </div>
        </div>
      </div>
    </a>
  )
}
