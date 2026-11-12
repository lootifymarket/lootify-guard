import styles from './Avatar.module.css'

type Props = {
  name: string
  /** The Steam avatar, or null to show the initials instead. */
  src: string | null
  size: 'sm' | 'lg'
}

export default function Avatar({ name, src, size }: Props) {
  if (src) {
    return (
      <img className={`${styles.avatar} ${styles[size]}`} src={src} alt="" />
    )
  }
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}
