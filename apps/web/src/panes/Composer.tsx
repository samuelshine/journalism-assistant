import { useState } from 'react'
import type { AgentInfo } from '../types/events'

interface Props {
  agentsList: AgentInfo[]
  selectedAgentId: string
  onSelectAgent: (id: string) => void
  running: boolean
  onRun: (prompt: string) => void
  onStop: () => void
}

const PLACEHOLDER_BY_AGENT: Record<string, string> = {
  researcher: 'e.g. Build me a dossier on water scarcity in Chennai',
  editor: 'e.g. Write a headline and lede for this draft: …',
}

export default function Composer({ agentsList, selectedAgentId, onSelectAgent, running, onRun, onStop }: Props) {
  const [prompt, setPrompt] = useState('')
  const selected = agentsList.find((a) => a.id === selectedAgentId)

  function submit() {
    if (!prompt.trim() || running) return
    onRun(prompt.trim())
  }

  return (
    <div className="border-b border-(--color-border) bg-(--color-surface) px-6 py-4 md:px-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {agentsList.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelectAgent(a.id)}
            disabled={running}
            className={`rounded-full border px-3 py-1 font-(family-name:--font-mono) text-xs transition-colors disabled:opacity-50 ${
              a.id === selectedAgentId
                ? 'border-(--color-amber) text-(--color-amber)'
                : 'border-(--color-border) text-(--color-muted) hover:border-(--color-muted)'
            }`}
          >
            {a.name}
          </button>
        ))}
        {selected && <span className="font-(family-name:--font-mono) text-xs text-(--color-muted)">{selected.description}</span>}
      </div>

      <div className="flex items-end gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={PLACEHOLDER_BY_AGENT[selectedAgentId] ?? 'Ask the desk…'}
          rows={2}
          disabled={running}
          className="flex-1 resize-none rounded border border-(--color-border) bg-(--color-ink) px-3 py-2 font-(family-name:--font-sans) text-sm text-(--color-paper) placeholder:text-(--color-muted) focus:border-(--color-amber) focus:outline-none disabled:opacity-60"
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded border border-(--color-error) px-4 py-2 font-(family-name:--font-mono) text-xs text-(--color-error) hover:bg-(--color-error)/10"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!prompt.trim()}
            className="shrink-0 rounded bg-(--color-amber) px-4 py-2 font-(family-name:--font-mono) text-xs font-medium text-(--color-ink) disabled:opacity-40"
          >
            Run
          </button>
        )}
      </div>
    </div>
  )
}
