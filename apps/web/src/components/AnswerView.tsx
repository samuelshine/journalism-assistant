import type { ReactNode } from 'react'
import ClaimChip from './ClaimChip'

interface Props {
  text: string
  knownIndices: Set<number>
  onCiteClick: (index: number) => void
}

const CITE_RE = /\[(\d+)\]/g

function renderInline(text: string, knownIndices: Set<number>, onCiteClick: (i: number) => void, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  CITE_RE.lastIndex = 0
  while ((match = CITE_RE.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const idx = Number(match[1])
    nodes.push(
      <ClaimChip key={`${keyPrefix}-c${i++}`} index={idx} resolved={knownIndices.has(idx)} onClick={onCiteClick} />,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// Lightweight markdown-ish rendering (headers, bullets, paragraphs) with
// [n] citation markers turned into clickable chips — good enough for the
// structured dossiers/ledes the Researcher and Editor agents write, without
// pulling in a markdown dependency for a handful of block types.
export default function AnswerView({ text, knownIndices, onCiteClick }: Props) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="font-(family-name:--font-serif) text-[15px] leading-relaxed text-(--color-paper)">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim())
        if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={bi} className="my-3 ml-5 list-disc space-y-1">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^[-*]\s/, ''), knownIndices, onCiteClick, `${bi}-${li}`)}</li>
              ))}
            </ul>
          )
        }
        if (lines.length === 1 && /^#{1,4}\s/.test(lines[0].trim())) {
          const headerText = lines[0].replace(/^#{1,4}\s/, '')
          return (
            <h4 key={bi} className="mt-4 mb-1 font-(family-name:--font-sans) text-xs font-semibold tracking-wide text-(--color-amber) uppercase first:mt-0">
              {headerText}
            </h4>
          )
        }
        return (
          <p key={bi} className="my-3 first:mt-0 last:mb-0">
            {renderInline(block, knownIndices, onCiteClick, `${bi}`)}
          </p>
        )
      })}
    </div>
  )
}
