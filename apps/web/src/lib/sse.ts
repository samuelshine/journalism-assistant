// Minimal SSE client over fetch()+ReadableStream. We don't use the native
// EventSource because it can't send a POST body, and the run prompt is
// arbitrary-length text — a query string is the wrong place for it.
import type { AgentEvent } from '../types/events'

export async function streamRun(
  prompt: string,
  agentId: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamFrom('/api/run', { prompt, agent: agentId }, onEvent, signal)
}

// Desk Chief auto-routes the request across a small pipeline of agents
// (see apps/api/crew.py) — same event stream shape, just no fixed agent id
// since the route itself is decided server-side.
export async function streamCrew(prompt: string, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  return streamFrom('/api/crew', { prompt }, onEvent, signal)
}

async function streamFrom(
  url: string,
  body: Record<string, string>,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`Run request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // sse_starlette frames events with CRLF, not bare LF — normalize once
    // here so the '\n\n' boundary search below actually matches.
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const parsed = parseEventBlock(rawEvent)
      if (parsed) onEvent(parsed)
    }
  }
}

function parseEventBlock(block: string): AgentEvent | null {
  let dataLine: string | null = null
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue // keepalive ping
    if (line.startsWith('data:')) dataLine = line.slice(5).trim()
  }
  if (!dataLine) return null
  try {
    return JSON.parse(dataLine) as AgentEvent
  } catch {
    return null
  }
}
