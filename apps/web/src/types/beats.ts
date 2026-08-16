export interface Beat {
  id: string
  topic: string
  interval_minutes: number
  created_at: number
  last_run_at: number | null
  brief_count: number
}

export interface Brief {
  id: string
  beat_id: string
  created_at: number
  text: string
  sources: { index: number; title: string; url: string }[]
}
