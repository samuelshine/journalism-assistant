import { useEffect, useState } from 'react'

type Health = { ok: boolean; demo_mode: boolean; checks: Record<string, { ok?: boolean; missing?: string[]; error?: string }> }

// Plain-language explanation for a failed check, aimed at someone who has
// never opened a browser console — this is the whole reason the status
// strip exists instead of just letting a run fail silently.
function explainFailure(name: string, check: { missing?: string[]; error?: string }): string {
  if (name === 'ollama') {
    if (check.missing?.length) return `Ollama is missing a model: run "ollama pull ${check.missing[0]}"`
    return 'Ollama isn\'t responding — start it with "ollama serve"'
  }
  if (name === 'sqlite_vec') return 'The database extension for memory search failed to load'
  if (name === 'external_api') return 'No network reachable right now — try Demo Mode if this is for a live class'
  if (name === 'ffmpeg') return 'ffmpeg isn\'t installed — Studio (audio/transcripts) needs it'
  return check.error || `${name} isn't ready`
}

// Compact version of the Phase 0 health page — a corner-of-the-eye status
// strip so the diagnostic info stays available without taking over the UI
// now that the main app has real work to do.
export default function StatusStrip() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/health')
        const data = (await res.json()) as Health
        if (!cancelled) setHealth(data)
      } catch {
        if (!cancelled) setHealth(null)
      }
    }
    check()
    const id = setInterval(check, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const ok = health?.ok
  const ignored = new Set(['whisper', ...(health?.demo_mode ? ['external_api'] : [])])
  const failures = health
    ? Object.entries(health.checks)
        .filter(([name, check]) => !ignored.has(name) && check.ok === false)
        .map(([name, check]) => explainFailure(name, check))
    : []
  const tooltip = ok ? 'Everything is ready' : failures.length > 0 ? failures.join(' · ') : 'Checking…'

  return (
    <div className="flex items-center gap-3">
      {health?.demo_mode && (
        <span
          title="Demo Mode — the desk works from saved research so the class doesn't depend on the wifi"
          className="rounded-sm border border-(--color-masthead) px-2 py-0.5 font-(family-name:--font-serif) text-[11px] font-medium text-(--color-masthead) italic"
        >
          Demo Mode
        </span>
      )}
      <div
        title={tooltip}
        className="flex items-center gap-1.5 font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-(--color-verified)' : ok === false ? 'bg-(--color-error)' : 'bg-(--color-ink-faint)'}`}
        />
        {ok === undefined ? 'checking' : ok ? 'the desk is ready' : (failures[0] ?? 'needs attention')}
      </div>
    </div>
  )
}
