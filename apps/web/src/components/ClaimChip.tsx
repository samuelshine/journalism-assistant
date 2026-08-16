interface Props {
  index: number
  resolved: boolean
  onClick: (index: number) => void
}

// A footnote marker, styled the way a printed footnote number reads — not
// a code badge. Resolved (masthead red, like real ink) points at a real
// clipping in the Sources rail; unresolved (dull red) means the model
// cited a number nothing backs — surfaced, not hidden.
export default function ClaimChip({ index, resolved, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // stops the click from bubbling into a wrapper that treats clicking
        // the article as "start editing" (see panes/Draft.tsx) — checking a
        // citation shouldn't also drop you into edit mode
        e.stopPropagation()
        onClick(index)
      }}
      title={resolved ? `Jump to source ${index}` : `This citation doesn't match a real source — worth double-checking`}
      className={`align-super font-(family-name:--font-serif) text-[0.7em] font-semibold leading-none ${
        resolved ? 'text-(--color-masthead) hover:underline' : 'text-(--color-error) hover:underline'
      }`}
    >
      [{index}]
    </button>
  )
}
