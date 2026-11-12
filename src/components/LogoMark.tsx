type Props = {
  size: number
}

export default function LogoMark({ size }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M9 19H32V30H9Z" fill="#FF7A7A" />
      <path d="M32 19H55V30H32Z" fill="#E0262B" />
      <path d="M9 30H32V63C19 57 9 47 9 33Z" fill="#FF1A1A" />
      <path d="M32 30H55V33C55 47 45 57 32 63Z" fill="#A8121A" />
      <path d="M12 3L24 8.5L32 1.5V14.5H17Z" fill="#FF1A1A" />
      <path d="M32 1.5L40 8.5L52 3L47 14.5H32Z" fill="#CC0F14" />
    </svg>
  )
}
