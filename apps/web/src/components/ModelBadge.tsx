import { modelNickname } from '../lib/narrate'

interface Props {
  model: string
  rationale: string
}

// Which model is reasoning is a real, deliberate choice this desk makes —
// worth keeping visible — but it's not the headline. A quiet byline-style
// credit, not a technical badge; hover (or the model's real name) is there
// for anyone curious enough to look closer.
export default function ModelBadge({ model, rationale }: Props) {
  return (
    <span title={`${model} — ${rationale}`} className="font-(family-name:--font-serif) text-[13px] italic text-(--color-ink-faint)">
      reasoning by {modelNickname(model)}
    </span>
  )
}
