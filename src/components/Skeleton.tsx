import type { CSSProperties } from 'react'

type Props = {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  className?: string
}

/** A shimmering block in the shape of something still loading. */
export default function Skeleton({
  width = '100%',
  height = 14,
  radius,
  className,
}: Props) {
  return (
    <span
      aria-hidden="true"
      className={className ? `skeleton ${className}` : 'skeleton'}
      style={{ width, height, borderRadius: radius }}
    />
  )
}
