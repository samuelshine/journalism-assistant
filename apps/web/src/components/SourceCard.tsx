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

// A single "clipping" in the Sources rail — styled like an entry in a
// works-cited list rather than a data card, since that's a convention
// journalism students already read fluently.
export default function SourceCard({ source, highlighted }: Props) {
  const isInternal = !source.url || source.url.startsWith('memory://')
  return (
    <a
      href={isInternal ? undefined : source.url}
      target={isInternal ? undefined : '_blank'}
      rel={isInternal ? undefined : 'noreferrer'}
      id={`source-${source.index}`}
      className={`block rounded-sm border px-3 py-2.5 transition-colors ${isInternal ? 'cursor-default' : ''} ${
        highlighted
          ? 'border-(--color-masthead) bg-(--color-highlight)/40'
          : 'border-(--color-rule) bg-(--color-paper-raised) hover:border-(--color-ink-faint)'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 font-(family-name:--font-serif) text-xs font-semibold text-(--color-masthead)">
          {source.index}.
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-(family-name:--font-serif) text-[13.5px] font-medium text-(--color-ink)">{source.title}</div>
          {source.snippet && (
            <div className="mt-0.5 line-clamp-2 font-(family-name:--font-serif) text-xs text-(--color-ink-soft)">{source.snippet}</div>
          )}
          <div className="mt-1 flex items-center gap-2 font-(family-name:--font-sans) text-[10px] tracking-wide text-(--color-ink-faint) uppercase">
            <span>{isInternal ? 'desk notes' : hostname(source.url)}</span>
            {source.published_at && <span>· {source.published_at}</span>}
          </div>
        </div>
      </div>
    </a>
  )
}
