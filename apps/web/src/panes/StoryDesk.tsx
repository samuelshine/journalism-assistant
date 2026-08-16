import { buildMarkdown, downloadMarkdown } from '../lib/export'
import type { AgentInfo } from '../types/events'
import type { RunHistoryEntry } from '../types/history'

interface Props {
  open: boolean
  onClose: () => void
  history: RunHistoryEntry[]
  agentsById: Record<string, AgentInfo>
  onSelect: (entry: RunHistoryEntry) => void
  activeId: string | null
}

function timeAgo(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

// Session run history — every dossier, fact-check, or crew run this desk
// has done stays here to revisit. Backed by client state for now; the
// underlying runs are also durable in the server's memory store (Phase 2's
// semantic recall), so this is a view onto work already persisted, not the
// only copy of it.
export default function StoryDesk({ open, onClose, history, agentsById, onSelect, activeId }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <button
        type="button"
        aria-label="Close the Story Desk"
        onClick={onClose}
        className="flex-1 bg-(--color-ink)/30 backdrop-blur-[1px]"
      />
      <div className="flex h-full w-96 flex-col border-l border-(--color-rule) bg-(--color-paper)">
        <div className="flex items-center justify-between border-b border-(--color-rule) px-5 py-4">
          <div>
            <div className="font-(family-name:--font-display) text-lg text-(--color-ink)">Story Desk</div>
            <div className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">everything asked this session</div>
          </div>
          <button type="button" onClick={onClose} className="text-(--color-ink-faint) hover:text-(--color-ink)">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {history.length === 0 ? (
            <p className="px-1 font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">
              Every question asked lands here — click one later to bring the notes and article back up.
            </p>
          ) : (
            [...history].reverse().map((entry) => {
              const info = agentsById[entry.agentId]
              return (
                <div
                  key={entry.id}
                  className={`rounded-sm border px-3.5 py-3 transition-colors ${
                    entry.id === activeId
                      ? 'border-(--color-masthead) bg-(--color-highlight)/30'
                      : 'border-(--color-rule) bg-(--color-paper-raised) hover:border-(--color-ink-faint)'
                  }`}
                >
                  <button type="button" onClick={() => onSelect(entry)} className="block w-full text-left">
                    <div className="mb-1 flex items-center gap-1.5">
                      {info && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--color-${info.color})` }} />
                      )}
                      <span className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">
                        {info?.name ?? entry.agentId} · {timeAgo(entry.startedAt)}
                      </span>
                    </div>
                    <div className="line-clamp-2 font-(family-name:--font-serif) text-[14.5px] text-(--color-ink)">{entry.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadMarkdown(`newsroom-${entry.id}`, buildMarkdown(entry.prompt, entry.events, agentsById))}
                    className="mt-1.5 font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint) hover:text-(--color-masthead)"
                  >
                    ⬇ save as a file
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
