import Button from '../components/Button.tsx'
import Lockup from '../components/Lockup.tsx'
import styles from './Unlocked.module.css'

type Props = {
  onLock: () => void
}

export default function Unlocked({ onLock }: Props) {
  return (
    <div className={styles.screen}>
      <Lockup />
      <p className={styles.text}>The vault is open.</p>
      <Button variant="secondary" onClick={onLock}>
        Lock
      </Button>
    </div>
  )
}
