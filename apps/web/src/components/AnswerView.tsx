import type { ReactNode } from 'react'
import ClaimChip from './ClaimChip'
import VerdictRow from './VerdictRow'

interface Props {
  text: string
  knownIndices: Set<number>
  onCiteClick: (index: number) => void
}

// Citations and markdown-style bold in one pass — the model writes
// "**Lead paragraph:**"-style emphasis fairly often even outside real
// headers, and showing the literal asterisks read as a technical leftover
// bleeding through an otherwise typeset page.
const INLINE_RE = /\*\*(.+?)\*\*|\[(\d+)\]/g

// Matches the Fact-Checker's structured ruling lines — see the exact
// format specified in apps/api/agents/factchecker.py's system prompt.
const VERDICT_RE = /^-?\s*VERDICT:\s*(SUPPORTED|CONTESTED|UNVERIFIED)\s*\|\s*CONFIDENCE:\s*(HIGH|MEDIUM|LOW)\s*\|\s*CLAIM:\s*(.+)$/i

type Verdict = 'SUPPORTED' | 'CONTESTED' | 'UNVERIFIED'
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

function renderInline(text: string, knownIndices: Set<number>, onCiteClick: (i: number) => void, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{match[1]}</strong>)
    } else {
      const idx = Number(match[2])
      nodes.push(<ClaimChip key={`${keyPrefix}-c${i++}`} index={idx} resolved={knownIndices.has(idx)} onClick={onCiteClick} />)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// Lightweight markdown-ish rendering (headers, bullets, paragraphs) with
// [n] citation markers turned into footnote-style clickable numerals. The
// first real paragraph gets a drop cap — the one typographic signature
// that says "this is a piece of writing," not a chat reply.
export default function AnswerView({ text, knownIndices, onCiteClick }: Props) {
  const blocks = text.split(/\n{2,}/)
  let droppedCap = false
  return (
    <div className="font-(family-name:--font-serif) text-[16px] leading-[1.7] text-(--color-ink)">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim())
        if (lines.some((l) => VERDICT_RE.test(l.trim()))) {
          return (
            <div key={bi} className="my-3">
              {lines.map((l, li) => {
                const m = l.trim().match(VERDICT_RE)
                if (!m) return null
                const [, verdict, confidence, claimText] = m
                return (
                  <VerdictRow key={li} verdict={verdict.toUpperCase() as Verdict} confidence={confidence.toUpperCase() as Confidence}>
                    {renderInline(claimText, knownIndices, onCiteClick, `${bi}-${li}`)}
                  </VerdictRow>
                )
              })}
            </div>
          )
        }
        if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={bi} className="my-3 ml-5 list-disc space-y-1.5 marker:text-(--color-masthead)">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^[-*]\s/, ''), knownIndices, onCiteClick, `${bi}-${li}`)}</li>
              ))}
            </ul>
          )
        }
        if (lines.length === 1 && /^#{1,4}\s/.test(lines[0].trim())) {
          const headerText = lines[0].replace(/^#{1,4}\s/, '')
          return (
            <h4
              key={bi}
              className="mt-5 mb-2 border-b border-(--color-rule) pb-1 font-(family-name:--font-sans) text-[11px] font-semibold tracking-[0.08em] text-(--color-masthead) uppercase first:mt-0"
            >
              {headerText}
            </h4>
          )
        }
        const isDropCap = !droppedCap && block.trim().length > 40
        if (isDropCap) droppedCap = true
        return (
          <p key={bi} className={`my-3 first:mt-0 last:mb-0 ${isDropCap ? 'drop-cap' : ''}`}>
            {renderInline(block, knownIndices, onCiteClick, `${bi}`)}
          </p>
        )
      })}
    </div>
  )
}
