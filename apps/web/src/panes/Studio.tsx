import { useCallback, useRef, useState } from 'react'
import NotebookEntry from '../components/NotebookEntry'
import TranscriptView from '../components/TranscriptView'
import { buildNotebook } from '../lib/notebook'
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

  const notebook = buildNotebook(events)

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-5 md:px-10">
      <div className="mb-4 font-(family-name:--font-display) text-lg text-(--color-ink)">Bring in an interview</div>
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
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-7 text-center transition-colors ${
              dragOver ? 'border-(--color-masthead) bg-(--color-highlight)/30' : 'border-(--color-rule-strong) bg-(--color-paper-raised) hover:border-(--color-ink-faint)'
            }`}
          >
            <span className="font-(family-name:--font-serif) text-[15px] text-(--color-ink)">Drop an audio file</span>
            <span className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">or click to browse</span>
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
            className={`flex flex-col items-center justify-center gap-1 rounded-sm border px-4 py-7 text-center transition-colors disabled:opacity-50 ${
              recording ? 'border-(--color-error) bg-(--color-error)/5' : 'border-(--color-rule-strong) bg-(--color-paper-raised) hover:border-(--color-ink-faint)'
            }`}
          >
            <span className="font-(family-name:--font-serif) text-[15px] text-(--color-ink)">
              {recording ? '⏺ Stop recording' : '🎙 Record an interview'}
            </span>
            <span className="font-(family-name:--font-sans) text-[11px] text-(--color-ink-faint)">
              {recording ? 'click when you\'re done' : 'right from your microphone'}
            </span>
          </button>

          <div className="flex flex-col justify-center gap-2 rounded-sm border border-(--color-rule-strong) bg-(--color-paper-raised) px-4 py-7">
            <span className="font-(family-name:--font-serif) text-[15px] text-(--color-ink)">Paste a link</span>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
              placeholder="a YouTube or podcast link…"
              disabled={running}
              className="rounded-sm border border-(--color-rule) bg-(--color-paper) px-2.5 py-1.5 font-(family-name:--font-sans) text-[12.5px] text-(--color-ink) placeholder:text-(--color-ink-faint) focus:border-(--color-masthead) focus:outline-none"
            />
            <button
              type="button"
              onClick={submitUrl}
              disabled={running || !urlInput.trim()}
              className="rounded-sm bg-(--color-masthead) px-2.5 py-1.5 font-(family-name:--font-sans) text-[12.5px] font-medium text-(--color-paper-raised) disabled:opacity-40"
            >
              Bring it in
            </button>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-5 divide-y divide-(--color-rule)/60 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) px-3.5 py-2">
          {notebook.map((entry) => (
            <NotebookEntry key={entry.key} entry={entry} agentsById={{}} />
          ))}
          {running && (
            <div className="flex items-center gap-2 py-2 font-(family-name:--font-serif) text-[13px] text-(--color-ink-faint) italic">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-masthead)" />
              listening it through…
            </div>
          )}
        </div>
      )}

      {transcript && (
        <div className="mt-5 rounded-sm border border-(--color-rule) bg-(--color-paper-raised) p-5">
          <TranscriptView transcript={transcript} />
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-(--color-rule) pt-4">
            <span className="font-(family-name:--font-sans) text-[11px] tracking-wide text-(--color-ink-faint) uppercase">
              Send this to
            </span>
            <button
              type="button"
              onClick={() => onSendToAgent('factchecker', `Fact-check this transcript:\n\n${transcriptAsPlainText(transcript)}`)}
              className="rounded-full border border-(--color-rule) px-3 py-1 font-(family-name:--font-sans) text-[12.5px] text-(--color-ink-soft) hover:border-(--color-ink-faint) hover:text-(--color-ink)"
            >
              the Fact-Checker
            </button>
            <button
              type="button"
              onClick={() =>
                onSendToAgent('interviewer', `Suggest follow-up questions based on this transcript:\n\n${transcriptAsPlainText(transcript)}`)
              }
              className="rounded-full border border-(--color-rule) px-3 py-1 font-(family-name:--font-sans) text-[12.5px] text-(--color-ink-soft) hover:border-(--color-ink-faint) hover:text-(--color-ink)"
            >
              the Interviewer
            </button>
            <button
              type="button"
              onClick={() => {
                setTranscript(null)
                setEvents([])
              }}
              className="ml-auto rounded-full border border-(--color-rule) px-3 py-1 font-(family-name:--font-sans) text-[12.5px] text-(--color-ink-soft) hover:border-(--color-ink-faint) hover:text-(--color-ink)"
            >
              bring in another clip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
