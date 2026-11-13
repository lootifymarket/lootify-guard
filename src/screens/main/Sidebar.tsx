import Icon from '../../components/Icon.tsx'
import LogoMark from '../../components/LogoMark.tsx'
import { useSecondsLeft } from './useAccounts.ts'
import styles from './Sidebar.module.css'

export type Section = 'accounts' | 'guard' | 'proxies' | 'add'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  {
    id: 'guard',
    label: 'Steam Guard',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  },
  {
    id: 'proxies',
    label: 'Proxies',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z',
  },
  { id: 'add', label: 'Add account', icon: 'M12 5v14M5 12h14' },
]

const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'

type Props = {
  section: Section
  locksAt: number | null
  onSelect: (section: Section) => void
  onLock: () => void
}

export default function Sidebar({ section, locksAt, onSelect, onLock }: Props) {
  return (
    <nav aria-label="Main menu" className={styles.sidebar}>
      <button
        type="button"
        className={styles.home}
        onClick={() => onSelect('accounts')}
      >
        <LogoMark size={26} />
        <span className={styles.name}>LOOTIFY</span>
        <span className={styles.product}>Guard</span>
      </button>
      <div className={styles.items}>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.item}
            aria-current={item.id === section ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon path={item.icon} size={17} stroke={1.7} />
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.footer}>
        <span className={styles.vault}>
          <span className={styles.vaultState}>Vault unlocked</span>
          {locksAt !== null && <LocksIn deadline={locksAt} />}
        </span>
        <button
          type="button"
          className={styles.lock}
          aria-label="Lock"
          onClick={onLock}
        >
          <Icon path={LOCK} size={15} stroke={1.8} />
        </button>
      </div>
    </nav>
  )
}

function LocksIn({ deadline }: { deadline: number }) {
  const minutes = Math.max(1, Math.ceil(useSecondsLeft(deadline) / 60))
  return <span className={styles.locksIn}>Locks in {minutes} min</span>
}
