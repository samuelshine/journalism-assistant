interface Props {
  index: number
  resolved: boolean
  onClick: (index: number) => void
}

// A citation marker in the model's answer. Resolved (green) means it points
// at a real source card in the Evidence drawer; unresolved (red, shouldn't
// normally happen given the orchestrator's numbering discipline) means the
// model cited a number nothing backs — surfaced rather than hidden.
export default function ClaimChip({ index, resolved, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(index)}
      title={resolved ? `Jump to source ${index}` : `Model cited [${index}] but no source has that number`}
      className={`mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super font-(family-name:--font-mono) text-[10px] leading-none ${
        resolved
          ? 'bg-(--color-amber)/20 text-(--color-amber) hover:bg-(--color-amber)/30'
          : 'bg-(--color-error)/20 text-(--color-error)'
      }`}
    >
      {index}
    </button>
  )
}
