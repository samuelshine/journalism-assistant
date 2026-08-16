import type { ReactNode } from 'react'

interface Props {
  verdict: 'SUPPORTED' | 'CONTESTED' | 'UNVERIFIED'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  children: ReactNode // the claim text + citation chip(s), already rendered inline
}

const VERDICT_STYLE: Record<Props['verdict'], { color: string; icon: string }> = {
  SUPPORTED: { color: 'var(--color-ok)', icon: '✓' },
  CONTESTED: { color: 'var(--color-warn)', icon: '⚡' },
  UNVERIFIED: { color: 'var(--color-muted)', icon: '?' },
}

const CONFIDENCE_WIDTH: Record<Props['confidence'], string> = {
  HIGH: '100%',
  MEDIUM: '60%',
  LOW: '25%',
}

// The Fact-Checker's per-claim ruling, parsed out of its structured
// "- VERDICT: ... | CONFIDENCE: ... | CLAIM: ..." lines and rendered as a
// verdict badge + a confidence meter rather than plain bullet prose — this
// is the "confidence meter" the plan calls for, driven by the model's own
// stated confidence rather than a fabricated number.
export default function VerdictRow({ verdict, confidence, children }: Props) {
  const style = VERDICT_STYLE[verdict]
  return (
    <div className="my-2 flex items-start gap-3 rounded border border-(--color-border) bg-(--color-surface-raised) px-3 py-2">
      <span
        className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] font-semibold tracking-wide"
        style={{ color: style.color, backgroundColor: `color-mix(in srgb, ${style.color} 15%, transparent)` }}
      >
        {style.icon} {verdict}
      </span>
      <div className="min-w-0 flex-1 font-(family-name:--font-serif) text-sm text-(--color-paper)">{children}</div>
      <div className="mt-1 flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-(family-name:--font-mono) text-[9px] text-(--color-muted)">{confidence}</span>
        <div className="h-1 w-12 overflow-hidden rounded-full bg-(--color-border)">
          <div className="h-full rounded-full" style={{ width: CONFIDENCE_WIDTH[confidence], backgroundColor: style.color }} />
        </div>
      </div>
    </div>
  )
}
