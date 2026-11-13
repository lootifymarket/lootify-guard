import styles from './LogoMark.module.css'

type Props = {
  size: number
  /** Draws itself in: the outline, then the facets, then the crown. */
  animate?: boolean
}

export default function LogoMark({ size, animate = false }: Props) {
  const part = (name: keyof typeof styles) =>
    animate ? styles[name] : undefined
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={styles.mark}
    >
      {animate && (
        <path
          className={styles.outline}
          d="M10 18H54V37C54 50 44 58 32 63C20 58 10 50 10 37Z"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
      <g className={part('band')}>
        <path d="M9 19H32V30H9Z" fill="#FF7A7A" />
        <path d="M32 19H55V30H32Z" fill="#E0262B" />
      </g>
      <path
        className={part('left')}
        d="M9 30H32V63C19 57 9 47 9 33Z"
        fill="#FF1A1A"
      />
      <path
        className={part('right')}
        d="M32 30H55V33C55 47 45 57 32 63Z"
        fill="#A8121A"
      />
      <g className={part('crown')}>
        <path d="M12 3L24 8.5L32 1.5V14.5H17Z" fill="#FF1A1A" />
        <path d="M32 1.5L40 8.5L52 3L47 14.5H32Z" fill="#CC0F14" />
      </g>
    </svg>
  )
}
