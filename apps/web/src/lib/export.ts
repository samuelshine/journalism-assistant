import type { Article } from '../types/articles'
import type { AgentEvent, AgentInfo, SourceRef } from '../types/events'

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

// A story package: every answer produced, every source behind it, and the
// full step-by-step trace — so the citation trail a student saw on screen
// is still there after the demo, not just the prose.
export function buildMarkdown(prompt: string, events: AgentEvent[], agentsById: Record<string, AgentInfo>): string {
  const lines: string[] = []
  const answers = events.filter((e): e is Extract<AgentEvent, { type: 'answer_done' }> => e.type === 'answer_done')
  const sources = new Map<number, SourceRef>()
  for (const e of events) {
    if (e.type === 'tool_result' || e.type === 'answer_done') {
      for (const s of e.sources) sources.set(s.index, s)
    }
  }

  lines.push(`# NEWSROOM story package`, '', `**Prompt:** ${prompt}`, '', `**Generated:** ${new Date().toLocaleString()}`, '')

  for (const answer of answers) {
    const info = agentsById[answer.agent]
    lines.push(`## ${info?.name ?? answer.agent}`, '', answer.text, '')
  }

  if (sources.size > 0) {
    lines.push('## Sources', '')
    for (const s of Array.from(sources.values()).sort((a, b) => a.index - b.index)) {
      const link = s.url && !s.url.startsWith('memory://') ? `[${s.title}](${s.url})` : s.title
      lines.push(`${s.index}. ${link} — via \`${s.tool}\`, retrieved ${formatDate(s.fetched_at)}`)
    }
    lines.push('')
  }

  lines.push('## Full trace', '')
  for (const e of events) {
    if (e.type === 'tool_call') {
      lines.push(`- 🔧 \`${e.tool}\`(${JSON.stringify(e.args)})`)
    } else if (e.type === 'tool_result') {
      lines.push(`  - ${e.ok ? '✓' : '✗'} ${e.summary}`)
    } else if (e.type === 'handoff') {
      lines.push(`- → **${agentsById[e.from_agent]?.name ?? e.from_agent}** hands off to **${agentsById[e.to_agent]?.name ?? e.to_agent}** — ${e.reason}`)
    } else if (e.type === 'error') {
      lines.push(`- ⚠️ ${e.message}`)
    }
  }

  return lines.join('\n')
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Shared markdown-ish parsing for an article body — the same conventions
// AnswerView renders on screen (headers, bullets, **bold**, [n] citations)
// — so what a journalist exports matches what they saw in the workspace.
type InlineToken = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'cite'; index: number }

const INLINE_RE = /\*\*(.+?)\*\*|\[(\d+)\]/g

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  let match: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(text))) {
    if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[1] !== undefined) tokens.push({ kind: 'bold', text: match[1] })
    else tokens.push({ kind: 'cite', index: Number(match[2]) })
    last = match.index + match[0].length
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) })
  return tokens
}

type ArticleBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'paragraph'; text: string }

function parseArticleBlocks(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  for (const raw of body.split(/\n{2,}/)) {
    const lines = raw.split('\n').filter((l) => l.trim())
    if (lines.length === 0) continue
    if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
      blocks.push({ kind: 'bullets', items: lines.map((l) => l.replace(/^[-*]\s/, '')) })
    } else if (lines.length === 1 && /^#{1,4}\s/.test(lines[0].trim())) {
      blocks.push({ kind: 'heading', text: lines[0].replace(/^#{1,4}\s/, '') })
    } else {
      blocks.push({ kind: 'paragraph', text: raw })
    }
  }
  return blocks
}

function sourceLine(s: SourceRef): string {
  const link = s.url && !s.url.startsWith('memory://') ? `[${s.title}](${s.url})` : s.title
  return `${s.index}. ${link}${s.tool ? ` — via \`${s.tool}\`` : ''}`
}

// The body is already stored in the same markdown dialect AnswerView
// renders, so exporting it is close to a pass-through — just add the
// title and a real Sources section as endnotes.
export function buildArticleMarkdown(article: Article): string {
  const lines: string[] = [`# ${article.title}`, '', article.body_markdown.trim(), '']
  if (article.sources.length > 0) {
    lines.push('## Sources', '')
    for (const s of [...article.sources].sort((a, b) => a.index - b.index)) {
      lines.push(sourceLine(s))
    }
    lines.push('')
  }
  return lines.join('\n')
}

function inlineToPlainText(text: string, sourcesByIndex: Map<number, SourceRef>): string {
  return tokenizeInline(text)
    .map((t) => {
      if (t.kind === 'text' || t.kind === 'bold') return t.text
      const s = sourcesByIndex.get(t.index)
      return s ? `(Source: ${s.title}, ${s.url})` : `(Source: unverified — the AI cited this but nothing backs it up)`
    })
    .join('')
    .replace(/\s*\(Source:/g, ' (Source:')
}

// For pasting straight into a CMS or email — no markdown ceremony, and
// citations become their actual source right in the sentence rather than
// a bracketed number that means nothing without a footnote list.
export function buildArticlePlainText(article: Article): string {
  const sourcesByIndex = new Map(article.sources.map((s) => [s.index, s]))
  const blocks = parseArticleBlocks(article.body_markdown)
  const lines: string[] = [article.title, '='.repeat(article.title.length), '']
  for (const block of blocks) {
    if (block.kind === 'heading') {
      lines.push(block.text.toUpperCase(), '')
    } else if (block.kind === 'bullets') {
      for (const item of block.items) lines.push(`- ${inlineToPlainText(item, sourcesByIndex)}`)
      lines.push('')
    } else {
      lines.push(inlineToPlainText(block.text, sourcesByIndex), '')
    }
  }
  return `${lines.join('\n').trim()}\n`
}

function inlineToDocxRuns(text: string, sourcesByIndex: Map<number, SourceRef>, TextRun: typeof import('docx').TextRun) {
  return tokenizeInline(text).map((t) => {
    if (t.kind === 'bold') return new TextRun({ text: t.text, bold: true })
    if (t.kind === 'cite') {
      const resolved = sourcesByIndex.has(t.index)
      return new TextRun({ text: `[${t.index}]`, superScript: true, color: resolved ? '8A2318' : 'A33B2A' })
    }
    return new TextRun(t.text)
  })
}

// A real .docx, built client-side — no backend round trip, consistent
// with Markdown/plain-text export already being local-only. Drop caps
// don't have a clean Word equivalent from generated markup, so the first
// paragraph just renders as a normal paragraph like the rest. `docx` is
// a ~350KB dependency only this function needs — dynamically imported so
// it doesn't bloat the initial bundle for people who never click Export.
export async function buildArticleDocx(article: Article): Promise<Blob> {
  const { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx')
  const sourcesByIndex = new Map(article.sources.map((s) => [s.index, s]))
  const blocks = parseArticleBlocks(article.body_markdown)

  const children = [new Paragraph({ text: article.title, heading: HeadingLevel.TITLE, spacing: { after: 240 } })]

  for (const block of blocks) {
    if (block.kind === 'heading') {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } }))
    } else if (block.kind === 'bullets') {
      for (const item of block.items) {
        children.push(new Paragraph({ children: inlineToDocxRuns(item, sourcesByIndex, TextRun), bullet: { level: 0 } }))
      }
    } else {
      children.push(new Paragraph({ children: inlineToDocxRuns(block.text, sourcesByIndex, TextRun), spacing: { after: 200 } }))
    }
  }

  if (article.sources.length > 0) {
    children.push(new Paragraph({ text: 'Sources', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }))
    for (const s of [...article.sources].sort((a, b) => a.index - b.index)) {
      const hasLink = Boolean(s.url) && !s.url.startsWith('memory://')
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun(`${s.index}. ${s.title}${hasLink ? ' — ' : ''}`),
            ...(hasLink ? [new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, style: 'Hyperlink' })] })] : []),
          ],
        }),
      )
    }
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
