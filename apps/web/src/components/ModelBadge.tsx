interface Props {
  model: string
  rationale: string
}

// The point of this badge: model choice is a visible engineering decision,
// not a black box. Hover to see why this specific model was picked.
export default function ModelBadge({ model, rationale }: Props) {
  return (
    <span
      title={rationale}
      className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface-raised) px-2.5 py-0.5 font-(family-name:--font-mono) text-[11px] text-(--color-muted)"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-(--color-amber)" />
      {model}
    </span>
  )
}
