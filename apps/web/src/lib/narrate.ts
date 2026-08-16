// Plain-English narration for what a tool call is actually doing. The raw
// event stream (tool name + JSON args) is real and stays available behind
// a "Show details" toggle for anyone curious — but the default voice a
// journalism student sees should read like a reporter's notebook, not a
// function signature.

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function primaryArg(args: Record<string, unknown>): string | undefined {
  const value = args.query ?? args.title ?? args.place ?? args.text ?? args.url ?? args.beat_id
  if (typeof value !== 'string' || !value.trim()) return undefined
  return truncate(value, 64)
}

const TOOL_LABEL: Record<string, string> = {
  gdelt_search: 'Global news search',
  rss_fetch: 'Live India headlines',
  wikipedia_summary: 'Wikipedia background',
  wikidata_entity: 'Structured facts',
  nominatim_geocode: 'Map lookup',
  wayback_snapshot: 'Web archive check',
  openalex_search: 'Academic research',
  fetch_url: 'Full article read',
  readability_score: 'Readability check',
  extract_claims: 'Claim spotting',
  search_memory: "Desk's earlier notes",
}

export function toolLabel(tool: string): string {
  return TOOL_LABEL[tool] ?? tool.replace(/_/g, ' ')
}

export function narrateToolCall(tool: string, args: Record<string, unknown>): string {
  const q = primaryArg(args)
  switch (tool) {
    case 'gdelt_search':
      return q ? `Scanning global news coverage for “${q}”` : 'Scanning global news coverage'
    case 'rss_fetch':
      return 'Checking live headlines from India’s news outlets'
    case 'wikipedia_summary':
      return q ? `Looking up “${q}” on Wikipedia for background` : 'Looking up background on Wikipedia'
    case 'wikidata_entity':
      return q ? `Checking structured facts on “${q}”` : 'Checking structured reference facts'
    case 'nominatim_geocode':
      return q ? `Locating “${q}” on the map` : 'Locating the place'
    case 'wayback_snapshot':
      return 'Checking the Wayback Machine for an archived copy'
    case 'openalex_search':
      return q ? `Searching academic research on “${q}”` : 'Searching academic research'
    case 'fetch_url':
      return 'Reading the full article'
    case 'readability_score':
      return 'Checking how easy this draft is to read'
    case 'extract_claims':
      return 'Pulling out the factual claims worth checking'
    case 'search_memory':
      return q ? `Checking the desk's earlier notes on “${q}”` : "Checking the desk's earlier notes"
    default:
      return q ? `${toolLabel(tool)}: “${q}”` : toolLabel(tool)
  }
}

const MODEL_NICKNAME: Record<string, string> = {
  'qwen2.5:14b': 'Qwen',
  'mistral-nemo:12b': 'Mistral',
  'gemma4:e4b': 'Gemma',
}

export function modelNickname(model: string): string {
  return MODEL_NICKNAME[model] ?? model
}
