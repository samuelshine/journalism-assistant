import { useEffect, useState } from 'react'

type CheckResult = Record<string, unknown> & { ok?: boolean }
type Health = { ok: boolean; demo_mode: boolean; checks: Record<string, CheckResult> }

const LABELS: Record<string, string> = {
  ollama: 'Ollama — local model runtime',
  sqlite_vec: 'SQLite + sqlite-vec — memory store',
  external_api: 'Live source — Wikipedia probe',
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-(--color-muted) animate-pulse" />
  }
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok ? 'bg-(--color-ok)' : 'bg-(--color-error)'
      }`}
      style={ok ? { boxShadow: '0 0 8px color-mix(in srgb, var(--color-ok) 70%, transparent)' } : undefined}
    />
  )
}

function detailLine(key: string, result: CheckResult): string {
  if (key === 'ollama') {
    if (!result.ok) return String(result.error ?? `missing: ${(result.missing as string[])?.join(', ')}`)
    return `${(result.models_present as string[]).length} required models present`
  }
  if (key === 'sqlite_vec') {
    return result.ok ? `v${result.version}` : String(result.error)
  }
  if (key === 'external_api') {
    return result.ok ? `200 in ${result.latency_ms}ms` : String(result.error ?? `status ${result.status}`)
  }
  return JSON.stringify(result)
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<string>('')

  async function runCheck() {
    try {
      const res = await fetch('/api/health')
      const data = (await res.json()) as Health
      setHealth(data)
      setError(null)
    } catch (e) {
      setError('Cannot reach API — is apps/api running on :8000?')
    }
    setCheckedAt(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    runCheck()
    const id = setInterval(runCheck, 8000)
    return () => clearInterval(id)
  }, [])

  const order = ['ollama', 'sqlite_vec', 'external_api']

  return (
    <div className="min-h-screen bg-(--color-ink) text-(--color-paper) px-6 py-10 md:px-16">
      <header className="mb-10 border-b border-(--color-border) pb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-(family-name:--font-serif) italic text-4xl md:text-5xl tracking-tight">
            NEWSROOM
          </h1>
          <span className="font-(family-name:--font-mono) text-xs uppercase tracking-[0.2em] text-(--color-amber)">
            agentic desk · phase 0
          </span>
        </div>
        <p className="mt-2 font-(family-name:--font-mono) text-sm text-(--color-muted)">
          system check — every subsystem the orchestrator will depend on, verified live.
        </p>
      </header>

      <main className="max-w-2xl">
        {error && (
          <div className="mb-6 rounded border border-(--color-error) bg-(--color-surface) px-4 py-3 font-(family-name:--font-mono) text-sm text-(--color-error)">
            {error}
          </div>
        )}

        <div className="rounded border border-(--color-border) bg-(--color-surface) divide-y divide-(--color-border)">
          {order.map((key) => {
            const result = health?.checks?.[key]
            return (
              <div key={key} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-1">
                  <StatusDot ok={result?.ok as boolean | undefined} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-(family-name:--font-sans) text-sm font-medium">
                    {LABELS[key]}
                  </div>
                  <div className="font-(family-name:--font-mono) text-xs text-(--color-muted) truncate">
                    {result ? detailLine(key, result) : 'checking…'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between font-(family-name:--font-mono) text-xs text-(--color-muted)">
          <span>
            overall: {health ? (health.ok ? <span className="text-(--color-ok)">ready</span> : <span className="text-(--color-error)">not ready</span>) : '—'}
            {health?.demo_mode ? '  ·  demo mode' : ''}
          </span>
          <span>last checked {checkedAt || '—'}</span>
        </div>
      </main>
    </div>
  )
}
