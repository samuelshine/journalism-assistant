import { useCallback, useEffect, useRef, useState } from 'react'
import AnswerView from '../components/AnswerView'
import type { Article } from '../types/articles'
import EvidenceDrawer from './EvidenceDrawer'

interface Props {
  activeArticleId: string | null
  onActiveArticleHandled: () => void
}

function timeAgo(ts: number): string {
  const seconds = Math.round(Date.now() / 1000 - ts)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function DraftList({
  articles,
  activeId,
  onSelect,
  onDelete,
}: {
  articles: Article[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-(--color-rule) px-3 py-4">
      <div className="mb-2 px-1 font-(family-name:--font-sans) text-[11px] font-semibold tracking-wide text-(--color-ink-faint) uppercase">
        My Drafts
      </div>
      {articles.length === 0 ? (
        <p className="px-1 font-(family-name:--font-serif) text-[12.5px] text-(--color-ink-faint) italic">
          Nothing here yet — open a finished answer from The Desk and choose "Open in Draft workspace."
        </p>
      ) : (
        <div className="space-y-1">
          {articles.map((a) => (
            <div
              key={a.id}
              className={`group rounded-sm px-2 py-1.5 ${a.id === activeId ? 'bg-(--color-highlight)/40' : 'hover:bg-(--color-paper-sunken)'}`}
            >
              <button type="button" onClick={() => onSelect(a.id)} className="block w-full text-left">
                <div className="line-clamp-2 font-(family-name:--font-serif) text-[13.5px] text-(--color-ink)">{a.title || 'Untitled'}</div>
                <div className="mt-0.5 flex items-center justify-between font-(family-name:--font-sans) text-[10px] text-(--color-ink-faint)">
                  <span>{timeAgo(a.updated_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(a.id)
                    }}
                    className="opacity-0 hover:text-(--color-error) group-hover:opacity-100"
                  >
                    remove
                  </button>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Draft({ activeArticleId, onActiveArticleHandled }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [active, setActive] = useState<Article | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleCiteClick(index: number) {
    setHighlighted(index)
    document.getElementById(`source-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setHighlighted((h) => (h === index ? null : h)), 2500)
  }

  const refresh = useCallback(async () => {
    const res = await fetch('/api/articles')
    setArticles(await res.json())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loadArticle = useCallback(async (id: string) => {
    const res = await fetch(`/api/articles/${id}`)
    if (!res.ok) return
    const article: Article = await res.json()
    setActive(article)
    setEditing(false)
  }, [])

  // A run's answer card ("Open in Draft workspace") sets this from App.tsx;
  // consume it once, then let App.tsx clear it so switching tabs later
  // doesn't keep re-loading the same article over a manual selection.
  useEffect(() => {
    if (activeArticleId) {
      loadArticle(activeArticleId)
      refresh()
      onActiveArticleHandled()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArticleId])

  function scheduleSave(next: Partial<Pick<Article, 'title' | 'body_markdown'>>) {
    if (!active) return
    setSaveState('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const res = await fetch(`/api/articles/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (res.ok) {
        const updated: Article = await res.json()
        setActive(updated)
        setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
        setSaveState('saved')
      }
    }, 700)
  }

  function startEditing() {
    if (!active) return
    setDraftText(active.body_markdown)
    setEditing(true)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function stopEditing() {
    setEditing(false)
  }

  async function deleteArticle(id: string) {
    await fetch(`/api/articles/${id}`, { method: 'DELETE' })
    if (active?.id === id) setActive(null)
    refresh()
  }

  const knownIndices = new Set((active?.sources ?? []).map((s) => s.index))

  return (
    <div className="flex h-full min-h-0 flex-1">
      <DraftList articles={articles} activeId={active?.id ?? null} onSelect={loadArticle} onDelete={deleteArticle} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5 md:px-10">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-center font-(family-name:--font-serif) text-[15px] text-(--color-ink-faint) italic">
            Pick a draft on the left, or open a finished answer from The Desk into the workspace.
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <input
                value={active.title}
                onChange={(e) => {
                  setActive({ ...active, title: e.target.value })
                  scheduleSave({ title: e.target.value })
                }}
                className="w-full border-none bg-transparent font-(family-name:--font-display) text-[26px] font-semibold text-(--color-ink) focus:outline-none"
              />
              <span className="ml-3 shrink-0 font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">
                {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : ''}
              </span>
            </div>
            <div className="mb-4 h-[3px] w-16 bg-(--color-masthead)" />

            {editing ? (
              <textarea
                ref={textareaRef}
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value)
                  scheduleSave({ body_markdown: e.target.value })
                }}
                onBlur={stopEditing}
                rows={20}
                className="min-h-[50vh] flex-1 resize-none border-none bg-transparent font-(family-name:--font-serif) text-[16px] leading-[1.7] text-(--color-ink) focus:outline-none"
              />
            ) : (
              // A <div>, not a <button> — AnswerView renders its own citation
              // buttons inline, and a button can't contain another button
              // (invalid HTML, breaks click handling). Citation clicks call
              // stopPropagation in ClaimChip's onClick chain isn't needed
              // here since handleCiteClick is passed through directly and
              // this wrapper's onClick only fires on parts of the article
              // that aren't already a clickable citation.
              <div
                role="button"
                tabIndex={0}
                onClick={startEditing}
                onKeyDown={(e) => e.key === 'Enter' && startEditing()}
                className="cursor-text text-left"
              >
                <AnswerView text={active.body_markdown} knownIndices={knownIndices} onCiteClick={handleCiteClick} />
              </div>
            )}
          </>
        )}
      </div>

      {active && <EvidenceDrawer sources={active.sources} highlightedIndex={highlighted} />}
    </div>
  )
}
