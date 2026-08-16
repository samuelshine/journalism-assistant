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
        aria-label="Close Story Desk"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="flex h-full w-80 flex-col border-l border-(--color-border) bg-(--color-surface)">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <span className="font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
            Story Desk — this session
          </span>
          <button type="button" onClick={onClose} className="text-(--color-muted) hover:text-(--color-paper)">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {history.length === 0 ? (
            <p className="px-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">
              Runs land here as you go — click one later to bring its trace and sources back up.
            </p>
          ) : (
            [...history].reverse().map((entry) => {
              const info = agentsById[entry.agentId]
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry)}
                  className={`block w-full rounded border px-3 py-2 text-left transition-colors ${
                    entry.id === activeId
                      ? 'border-(--color-amber) bg-(--color-surface-raised)'
                      : 'border-(--color-border) hover:border-(--color-muted)'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    {info && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--color-${info.color})` }} />
                    )}
                    <span className="font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
                      {info?.name ?? entry.agentId} · {timeAgo(entry.startedAt)}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-sm text-(--color-paper)">{entry.prompt}</div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
