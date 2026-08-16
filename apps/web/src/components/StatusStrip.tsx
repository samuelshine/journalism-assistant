import { useEffect, useState } from 'react'

type Health = { ok: boolean; demo_mode: boolean; checks: Record<string, { ok?: boolean }> }

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
        title={ok ? 'Everything is ready' : 'Something needs attention — check the console'}
        className="flex items-center gap-1.5 font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-(--color-verified)' : ok === false ? 'bg-(--color-error)' : 'bg-(--color-ink-faint)'}`}
        />
        {ok === undefined ? 'checking' : ok ? 'the desk is ready' : 'needs attention'}
      </div>
    </div>
  )
}
