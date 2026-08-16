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
    <div className="border-b border-(--color-rule) bg-(--color-paper-raised) px-6 py-5 md:px-10">
      <label className="mb-2 block font-(family-name:--font-display) text-lg text-(--color-ink)">Ask the desk</label>

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
          placeholder={PLACEHOLDER_BY_AGENT[selectedAgentId] ?? 'What do you need help with today?'}
          rows={2}
          disabled={running}
          className="flex-1 resize-none rounded-sm border border-(--color-rule) bg-(--color-paper) px-3.5 py-2.5 font-(family-name:--font-serif) text-[15px] text-(--color-ink) placeholder:text-(--color-ink-faint) placeholder:italic focus:border-(--color-masthead) focus:outline-none disabled:opacity-60"
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-sm border border-(--color-error) px-5 py-2.5 font-(family-name:--font-sans) text-sm font-medium text-(--color-error) hover:bg-(--color-error)/5"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!prompt.trim()}
            className="shrink-0 rounded-sm bg-(--color-masthead) px-5 py-2.5 font-(family-name:--font-sans) text-sm font-medium text-(--color-paper-raised) transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Ask →
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-(family-name:--font-sans) text-[11px] tracking-wide text-(--color-ink-faint) uppercase">
          Who's on this:
        </span>
        {deskChief && (
          <button
            type="button"
            onClick={() => onSelectAgent(deskChief.id)}
            disabled={running}
            title={deskChief.description}
            className={`rounded-full border px-3 py-1 font-(family-name:--font-sans) text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
              deskChief.id === selectedAgentId
                ? 'border-(--color-masthead) bg-(--color-masthead) text-(--color-paper-raised)'
                : 'border-(--color-masthead) text-(--color-masthead) hover:bg-(--color-masthead)/5'
            }`}
          >
            Whoever fits best
          </button>
        )}
        {specialists.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelectAgent(a.id)}
            disabled={running}
            title={a.description}
            className={`rounded-full border px-3 py-1 font-(family-name:--font-sans) text-[12.5px] transition-colors disabled:opacity-50 ${
              a.id === selectedAgentId
                ? 'border-(--color-ink) text-(--color-ink)'
                : 'border-(--color-rule) text-(--color-ink-soft) hover:border-(--color-ink-faint)'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-1.5 font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">{selected.description}</div>
      )}
    </div>
  )
}
