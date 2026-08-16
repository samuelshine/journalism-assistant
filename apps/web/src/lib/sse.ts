// Minimal SSE client over fetch()+ReadableStream. We don't use the native
// EventSource because it can't send a POST body, and neither the run
// prompt nor an audio upload belongs in a query string.
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

export async function streamMediaUrl(url: string, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  return streamFrom('/api/media/youtube', { url }, onEvent, signal)
}

export async function streamHallucinationLab(prompt: string, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  return streamFrom('/api/hallucination-lab', { prompt }, onEvent, signal)
}

export async function streamBeatRunNow(beatId: string, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api/beats/${beatId}/run-now`, { method: 'POST', signal })
  await consumeSSE(res, onEvent)
}

export async function streamArticleSection(
  articleId: string,
  instruction: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamFrom(`/api/articles/${articleId}/sections`, { instruction }, onEvent, signal)
}

export async function streamArticleRevise(
  articleId: string,
  instruction: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamFrom(`/api/articles/${articleId}/revise`, { instruction }, onEvent, signal)
}

// A dropped file or a mic-recorded Blob — same endpoint, ffmpeg reads
// either. The field name must match FastAPI's `file: UploadFile` param.
export async function streamMediaUpload(
  file: File | Blob,
  filename: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData()
  form.append('file', file, filename)
  const res = await fetch('/api/media/upload', { method: 'POST', body: form, signal })
  await consumeSSE(res, onEvent)
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
  await consumeSSE(res, onEvent)
}

async function consumeSSE(res: Response, onEvent: (event: AgentEvent) => void): Promise<void> {
  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`)
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
