import type { ComponentProps } from 'react'
import styles from './Button.module.css'

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'sm'
  busy?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  children,
  ...rest
}: Props) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={classes}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  )
}
