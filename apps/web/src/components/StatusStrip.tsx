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
          title="Demo Mode — network-dependent tools serve pre-recorded fixtures for the rehearsed demo prompts"
          className="rounded-full border border-(--color-amber) px-2 py-0.5 font-(family-name:--font-mono) text-[10px] font-medium text-(--color-amber)"
        >
          🎬 DEMO
        </span>
      )}
      <div
        title={ok ? 'All systems ready' : 'Some systems not ready — see console/api/health'}
        className="flex items-center gap-1.5 font-(family-name:--font-mono) text-[11px] text-(--color-muted)"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-(--color-ok)' : ok === false ? 'bg-(--color-error)' : 'bg-(--color-muted)'}`}
        />
        {ok === undefined ? 'checking' : ok ? 'ready' : 'degraded'}
      </div>
    </div>
  )
}
