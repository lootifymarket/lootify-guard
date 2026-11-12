import LogoMark from './LogoMark.tsx'
import styles from './Lockup.module.css'

type Props = {
  size?: 'md' | 'sm'
}

export default function Lockup({ size = 'md' }: Props) {
  return (
    <span className={`${styles.lockup} ${styles[size]}`}>
      <LogoMark size={size === 'md' ? 44 : 32} />
      <span className={styles.words}>
        <span className={styles.name}>LOOTIFY</span>
        <span className={styles.product}>GUARD</span>
      </span>
    </span>
  )
}
