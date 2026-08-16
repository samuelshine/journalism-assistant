import type { ReactNode } from 'react'

interface Props {
  verdict: 'SUPPORTED' | 'CONTESTED' | 'UNVERIFIED'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  children: ReactNode // the claim text + citation chip(s), already rendered inline
}

// Plain-language labels for what the backend tracks as SUPPORTED /
// CONTESTED / UNVERIFIED — the enum stays technical for parsing, the
// reader sees the word an editor would actually use.
const VERDICT_STYLE: Record<Props['verdict'], { color: string; label: string }> = {
  SUPPORTED: { color: 'var(--color-verified)', label: 'Verified' },
  CONTESTED: { color: 'var(--color-contested)', label: 'Disputed' },
  UNVERIFIED: { color: 'var(--color-unverified)', label: 'Unconfirmed' },
}

const CONFIDENCE_LABEL: Record<Props['confidence'], string> = {
  HIGH: 'high confidence',
  MEDIUM: 'some doubt',
  LOW: 'low confidence',
}

// The Fact-Checker's per-claim ruling, styled like a fact-check stamp — a
// convention students already recognise from PolitiFact/AP-style checks —
// rather than a dashboard status pill.
export default function VerdictRow({ verdict, confidence, children }: Props) {
  const style = VERDICT_STYLE[verdict]
  return (
    <div className="my-2.5 flex items-start gap-3 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) py-2.5 pr-3 pl-2.5">
      <span
        className="mt-0.5 shrink-0 rounded-sm border px-2 py-0.5 font-(family-name:--font-sans) text-[10px] font-bold tracking-wide uppercase"
        style={{ color: style.color, borderColor: style.color }}
      >
        {style.label}
      </span>
      <div className="min-w-0 flex-1 font-(family-name:--font-serif) text-[14.5px] text-(--color-ink)">{children}</div>
      <span className="mt-1 shrink-0 font-(family-name:--font-serif) text-[11px] italic whitespace-nowrap text-(--color-ink-faint)">
        {CONFIDENCE_LABEL[confidence]}
      </span>
    </div>
  )
}
