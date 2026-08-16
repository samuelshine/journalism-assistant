import type { SourceRef } from './events'

export interface Article {
  id: string
  title: string
  body_markdown: string
  sources: SourceRef[]
  origin_run_id: string | null
  created_at: number
  updated_at: number
}
