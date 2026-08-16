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
  desk_chief: 'e.g. Research Chennai water scarcity and write it up as a short news story',
  scout: 'e.g. Is anything moving on the Tamil Nadu water crisis right now?',
  researcher: 'e.g. Build me a dossier on water scarcity in Chennai',
  factchecker: 'e.g. Fact-check this draft paragraph: …',
  interviewer: 'e.g. Prep interview questions for M. K. Stalin on water policy',
  editor: 'e.g. Write a headline and lede for this draft: …',
  ethicist: 'e.g. Review this paragraph before we publish it: …',
}

export default function Composer({ agentsList, selectedAgentId, onSelectAgent, running, onRun, onStop }: Props) {
  const [prompt, setPrompt] = useState('')
  const deskChief = agentsList.find((a) => a.id === 'desk_chief')
  const specialists = agentsList.filter((a) => a.id !== 'desk_chief')
  const selected = agentsList.find((a) => a.id === selectedAgentId)

  function submit() {
    if (!prompt.trim() || running) return
    onRun(prompt.trim())
  }

  return (
    <div className="border-b border-(--color-border) bg-(--color-surface) px-6 py-4 md:px-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {deskChief && (
          <button
            type="button"
            onClick={() => onSelectAgent(deskChief.id)}
            disabled={running}
            title={deskChief.description}
            className={`rounded-full border px-3 py-1 font-(family-name:--font-mono) text-xs font-medium transition-colors disabled:opacity-50 ${
              deskChief.id === selectedAgentId
                ? 'border-(--color-amber) bg-(--color-amber) text-(--color-ink)'
                : 'border-(--color-amber) text-(--color-amber) hover:bg-(--color-amber)/10'
            }`}
          >
            🧭 {deskChief.name} · auto
          </button>
        )}
        <span className="text-(--color-border)">|</span>
        {specialists.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelectAgent(a.id)}
            disabled={running}
            title={a.description}
            className={`rounded-full border px-3 py-1 font-(family-name:--font-mono) text-xs transition-colors disabled:opacity-50 ${
              a.id === selectedAgentId
                ? 'border-(--color-paper) text-(--color-paper)'
                : 'border-(--color-border) text-(--color-muted) hover:border-(--color-muted)'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>
      {selected && <div className="mb-3 -mt-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">{selected.description}</div>}

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
