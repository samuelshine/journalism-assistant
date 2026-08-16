import { useCallback, useRef, useState } from 'react'
import TraceStep from '../components/TraceStep'
import TranscriptView from '../components/TranscriptView'
import { streamMediaUpload, streamMediaUrl } from '../lib/sse'
import type { AgentEvent, TranscriptReadyEvent } from '../types/events'

interface Props {
  onSendToAgent: (agentId: string, prompt: string) => void
}

function transcriptAsPlainText(t: TranscriptReadyEvent): string {
  return t.segments.map((s) => `[${s.speaker}] ${s.text}`).join('\n')
}

export default function Studio({ onSendToAgent }: Props) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [transcript, setTranscript] = useState<TranscriptReadyEvent | null>(null)
  const [running, setRunning] = useState(false)
  const [recording, setRecording] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const runPipeline = useCallback(async (kind: 'upload' | 'url', payload: File | Blob | string, filename?: string) => {
    setEvents([])
    setTranscript(null)
    setRunning(true)
    const onEvent = (event: AgentEvent) => {
      if (event.type === 'transcript_ready') {
        setTranscript(event)
      } else {
        setEvents((prev) => [...prev, event])
      }
    }
    try {
      if (kind === 'upload') {
        await streamMediaUpload(payload as File | Blob, filename ?? 'recording.webm', onEvent)
      } else {
        await streamMediaUrl(payload as string, onEvent)
      }
    } catch (e) {
      setEvents((prev) => [...prev, { type: 'error', run_id: 'client', ts: Date.now() / 1000, message: String(e), fatal: true }])
    } finally {
      setRunning(false)
    }
  }, [])

  function handleFile(file: File) {
    runPipeline('upload', file, file.name)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      runPipeline('upload', blob, 'mic-recording.webm')
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function submitUrl() {
    if (!urlInput.trim() || running) return
    runPipeline('url', urlInput.trim())
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-4 md:px-10">
      {!transcript && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? 'border-(--color-amber) bg-(--color-surface-raised)' : 'border-(--color-border) hover:border-(--color-muted)'
            }`}
          >
            <span className="font-(family-name:--font-mono) text-xs text-(--color-paper)">Drop an audio file</span>
            <span className="font-(family-name:--font-mono) text-[10px] text-(--color-muted)">or click to browse</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={running && !recording}
            className={`flex flex-col items-center justify-center gap-1 rounded border px-4 py-6 text-center transition-colors disabled:opacity-50 ${
              recording ? 'border-(--color-error) bg-(--color-error)/10' : 'border-(--color-border) hover:border-(--color-muted)'
            }`}
          >
            <span className="font-(family-name:--font-mono) text-xs text-(--color-paper)">
              {recording ? '⏺ Stop recording' : '🎙 Record from mic'}
            </span>
            <span className="font-(family-name:--font-mono) text-[10px] text-(--color-muted)">
              {recording ? 'click when done' : 'interview live'}
            </span>
          </button>

          <div className="flex flex-col justify-center gap-2 rounded border border-(--color-border) px-4 py-6">
            <span className="font-(family-name:--font-mono) text-xs text-(--color-paper)">Paste a URL</span>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
              placeholder="youtube.com/watch?v=…"
              disabled={running}
              className="rounded border border-(--color-border) bg-(--color-ink) px-2 py-1 font-(family-name:--font-mono) text-[11px] text-(--color-paper) placeholder:text-(--color-muted) focus:border-(--color-amber) focus:outline-none"
            />
            <button
              type="button"
              onClick={submitUrl}
              disabled={running || !urlInput.trim()}
              className="rounded bg-(--color-amber) px-2 py-1 font-(family-name:--font-mono) text-[11px] font-medium text-(--color-ink) disabled:opacity-40"
            >
              Fetch &amp; transcribe
            </button>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-4 space-y-0.5 rounded border border-(--color-border) bg-(--color-surface) p-3">
          {events.map((e, i) => (
            <TraceStep key={i} event={e} agentsById={{}} />
          ))}
          {running && (
            <div className="flex items-center gap-2 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted)">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-amber)" />
              processing…
            </div>
          )}
        </div>
      )}

      {transcript && (
        <div className="mt-4 rounded border border-(--color-border) bg-(--color-surface) p-5">
          <TranscriptView transcript={transcript} />
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-(--color-border) pt-4">
            <span className="font-(family-name:--font-mono) text-[10px] uppercase tracking-widest text-(--color-muted)">
              Send to
            </span>
            <button
              type="button"
              onClick={() => onSendToAgent('factchecker', `Fact-check this transcript:\n\n${transcriptAsPlainText(transcript)}`)}
              className="rounded-full border border-(--color-border) px-3 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:border-(--color-muted) hover:text-(--color-paper)"
            >
              Fact-Checker
            </button>
            <button
              type="button"
              onClick={() =>
                onSendToAgent('interviewer', `Suggest follow-up questions based on this transcript:\n\n${transcriptAsPlainText(transcript)}`)
              }
              className="rounded-full border border-(--color-border) px-3 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:border-(--color-muted) hover:text-(--color-paper)"
            >
              Interviewer
            </button>
            <button
              type="button"
              onClick={() => {
                setTranscript(null)
                setEvents([])
              }}
              className="ml-auto rounded-full border border-(--color-border) px-3 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) hover:border-(--color-muted) hover:text-(--color-paper)"
            >
              New clip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
