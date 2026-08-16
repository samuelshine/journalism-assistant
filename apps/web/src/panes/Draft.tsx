import { useCallback, useEffect, useRef, useState } from 'react'
import AnswerView from '../components/AnswerView'
import NotebookEntry from '../components/NotebookEntry'
import { streamArticleRevise, streamArticleSection } from '../lib/sse'
import { buildNotebook } from '../lib/notebook'
import { buildArticleDocx, buildArticleMarkdown, buildArticlePlainText, downloadBlob, downloadMarkdown } from '../lib/export'
import type { AgentEvent, AgentInfo, SourceRef } from '../types/events'
import type { Article } from '../types/articles'
import EvidenceDrawer from './EvidenceDrawer'

interface Props {
  activeArticleId: string | null
  onActiveArticleHandled: () => void
  agentsById: Record<string, AgentInfo>
}

type ToolMode = 'section' | 'revise' | null

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'draft'
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
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(a.id)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(a.id)}
                className="block w-full cursor-pointer text-left"
              >
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Draft({ activeArticleId, onActiveArticleHandled, agentsById }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [active, setActive] = useState<Article | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [toolMode, setToolMode] = useState<ToolMode>(null)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamEvents, setStreamEvents] = useState<AgentEvent[]>([])
  const [justAppended, setJustAppended] = useState<string | null>(null)
  const [revisionProposal, setRevisionProposal] = useState<{ text: string; sources: SourceRef[] } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  async function exportArticle(format: 'md' | 'txt' | 'docx') {
    if (!active) return
    setExportOpen(false)
    const slug = slugify(active.title)
    if (format === 'md') {
      downloadMarkdown(slug, buildArticleMarkdown(active))
    } else if (format === 'txt') {
      downloadBlob(`${slug}.txt`, new Blob([buildArticlePlainText(active)], { type: 'text/plain' }))
    } else {
      downloadBlob(`${slug}.docx`, await buildArticleDocx(active))
    }
  }

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
    setToolMode(null)
    setInstruction('')
    setStreamEvents([])
    setJustAppended(null)
    setRevisionProposal(null)
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

  async function persistNow(articleId: string, next: Partial<Pick<Article, 'body_markdown' | 'sources'>>) {
    setSaveState('saving')
    const res = await fetch(`/api/articles/${articleId}`, {
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
  }

  function cancelTool() {
    abortRef.current?.abort()
    setToolMode(null)
    setInstruction('')
    setBusy(false)
    setStreamEvents([])
  }

  async function submitSection() {
    if (!active || !instruction.trim()) return
    setBusy(true)
    setStreamEvents([])
    const controller = new AbortController()
    abortRef.current = controller
    const articleId = active.id
    let sectionText = ''
    let sectionSources: SourceRef[] = active.sources
    try {
      await streamArticleSection(
        articleId,
        instruction.trim(),
        (event) => {
          setStreamEvents((prev) => [...prev, event])
          if (event.type === 'answer_done') {
            sectionText = event.text
            sectionSources = event.sources
          }
        },
        controller.signal,
      )
      if (sectionText) {
        const combined = `${active.body_markdown.trimEnd()}\n\n${sectionText}`
        setActive({ ...active, body_markdown: combined, sources: sectionSources })
        setJustAppended(sectionText)
        await persistNow(articleId, { body_markdown: combined, sources: sectionSources })
        window.setTimeout(() => setJustAppended(null), 2500)
      }
    } catch {
      // aborted or network error — the reporting notes above already show what happened
    } finally {
      setBusy(false)
      setToolMode(null)
      setInstruction('')
    }
  }

  async function submitRevision() {
    if (!active || !instruction.trim()) return
    setBusy(true)
    setStreamEvents([])
    setRevisionProposal(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamArticleRevise(
        active.id,
        instruction.trim(),
        (event) => {
          setStreamEvents((prev) => [...prev, event])
          if (event.type === 'answer_done') {
            setRevisionProposal({ text: event.text, sources: event.sources })
          }
        },
        controller.signal,
      )
    } catch {
      // aborted or network error — the reporting notes above already show what happened
    } finally {
      setBusy(false)
    }
  }

  async function acceptRevision() {
    if (!active || !revisionProposal) return
    const { text, sources } = revisionProposal
    setActive({ ...active, body_markdown: text, sources })
    setRevisionProposal(null)
    setToolMode(null)
    setInstruction('')
    setStreamEvents([])
    await persistNow(active.id, { body_markdown: text, sources })
  }

  function discardRevision() {
    setRevisionProposal(null)
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
                className="w-full rounded-sm border-none bg-transparent font-(family-name:--font-display) text-[26px] font-semibold text-(--color-ink) focus:bg-(--color-highlight)/20 focus:outline-none"
              />
              <span className="ml-3 shrink-0 font-(family-name:--font-sans) text-[10.5px] text-(--color-ink-faint)">
                {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : ''}
              </span>
            </div>
            <div className="mb-4 h-[3px] w-16 bg-(--color-masthead)" />

            <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-(--color-rule) pb-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setToolMode(toolMode === 'section' ? null : 'section')
                  setInstruction('')
                  setStreamEvents([])
                  setRevisionProposal(null)
                }}
                className={`font-(family-name:--font-sans) text-[12px] font-medium ${
                  toolMode === 'section' ? 'text-(--color-masthead)' : 'text-(--color-ink-soft) hover:text-(--color-ink)'
                } disabled:opacity-40`}
              >
                + Add a section
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setToolMode(toolMode === 'revise' ? null : 'revise')
                  setInstruction('')
                  setStreamEvents([])
                  setRevisionProposal(null)
                }}
                className={`font-(family-name:--font-sans) text-[12px] font-medium ${
                  toolMode === 'revise' ? 'text-(--color-masthead)' : 'text-(--color-ink-soft) hover:text-(--color-ink)'
                } disabled:opacity-40`}
              >
                Ask for a revision
              </button>

              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  className="font-(family-name:--font-sans) text-[12px] font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
                >
                  Export ▾
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1.5 w-44 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) py-1 shadow-md">
                      <button
                        type="button"
                        onClick={() => exportArticle('md')}
                        className="block w-full px-3 py-1.5 text-left font-(family-name:--font-sans) text-[12.5px] text-(--color-ink) hover:bg-(--color-paper-sunken)"
                      >
                        Markdown (.md)
                      </button>
                      <button
                        type="button"
                        onClick={() => exportArticle('txt')}
                        className="block w-full px-3 py-1.5 text-left font-(family-name:--font-sans) text-[12.5px] text-(--color-ink) hover:bg-(--color-paper-sunken)"
                      >
                        Plain text (.txt)
                      </button>
                      <button
                        type="button"
                        onClick={() => exportArticle('docx')}
                        className="block w-full px-3 py-1.5 text-left font-(family-name:--font-sans) text-[12.5px] text-(--color-ink) hover:bg-(--color-paper-sunken)"
                      >
                        Word document (.docx)
                      </button>
                    </div>
                  </>
                )}
              </div>

              {toolMode && (
                <div className="flex w-full items-center gap-2">
                  <input
                    autoFocus
                    disabled={busy}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (toolMode === 'section') submitSection()
                        else submitRevision()
                      }
                      if (e.key === 'Escape') cancelTool()
                    }}
                    placeholder={
                      toolMode === 'section'
                        ? 'e.g. Add a section on the government’s response'
                        : 'e.g. Make the second paragraph shorter'
                    }
                    className="flex-1 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) px-3 py-1.5 font-(family-name:--font-serif) text-[13.5px] text-(--color-ink) focus:border-(--color-masthead) focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !instruction.trim()}
                    onClick={() => (toolMode === 'section' ? submitSection() : submitRevision())}
                    className="shrink-0 rounded-sm bg-(--color-masthead) px-3 py-1.5 font-(family-name:--font-sans) text-[12px] font-medium text-(--color-paper) disabled:opacity-40"
                  >
                    {busy ? 'Working…' : 'Go'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelTool}
                    className="shrink-0 font-(family-name:--font-sans) text-[12px] text-(--color-ink-faint) hover:text-(--color-ink)"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {streamEvents.length > 0 && (busy || toolMode) && (
                <div className="w-full divide-y divide-(--color-rule)/60 rounded-sm border border-(--color-rule) bg-(--color-paper-sunken) px-3 py-1.5">
                  {buildNotebook(streamEvents).map((entry) => (
                    <NotebookEntry key={entry.key} entry={entry} agentsById={agentsById} />
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 py-2 font-(family-name:--font-serif) text-[12.5px] text-(--color-ink-faint) italic">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-masthead)" />
                      still working…
                    </div>
                  )}
                </div>
              )}
            </div>

            {revisionProposal && (
              <div className="mb-5 shrink-0 overflow-hidden rounded-sm border border-(--color-masthead)">
                <div className="flex items-center justify-between bg-(--color-masthead) px-4 py-2">
                  <span className="font-(family-name:--font-sans) text-[11px] font-semibold tracking-[0.08em] text-(--color-paper) uppercase">
                    Proposed revision — nothing is changed until you accept
                  </span>
                </div>
                <div className="bg-(--color-paper-raised) px-5 py-4">
                  <AnswerView
                    text={revisionProposal.text}
                    knownIndices={new Set(revisionProposal.sources.map((s) => s.index))}
                    onCiteClick={() => {}}
                  />
                  <div className="mt-4 flex gap-3 border-t border-(--color-rule) pt-3">
                    <button
                      type="button"
                      onClick={acceptRevision}
                      className="rounded-sm bg-(--color-masthead) px-3 py-1.5 font-(family-name:--font-sans) text-[12px] font-medium text-(--color-paper)"
                    >
                      Accept — replace the draft
                    </button>
                    <button
                      type="button"
                      onClick={discardRevision}
                      className="font-(family-name:--font-sans) text-[12px] text-(--color-ink-faint) hover:text-(--color-ink)"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                className="min-h-[50vh] flex-1 resize-none rounded-sm border-none bg-transparent font-(family-name:--font-serif) text-[16px] leading-[1.7] text-(--color-ink) focus:bg-(--color-highlight)/10 focus:outline-none"
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
                {justAppended && active.body_markdown.endsWith(justAppended) ? (
                  <>
                    <AnswerView
                      text={active.body_markdown.slice(0, -justAppended.length).trimEnd()}
                      knownIndices={knownIndices}
                      onCiteClick={handleCiteClick}
                    />
                    <div className="fade-highlight -mx-2 rounded-sm px-2">
                      <AnswerView text={justAppended} knownIndices={knownIndices} onCiteClick={handleCiteClick} />
                    </div>
                  </>
                ) : (
                  <AnswerView text={active.body_markdown} knownIndices={knownIndices} onCiteClick={handleCiteClick} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {active && <EvidenceDrawer sources={active.sources} highlightedIndex={highlighted} />}
    </div>
  )
}
