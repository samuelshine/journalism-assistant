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
