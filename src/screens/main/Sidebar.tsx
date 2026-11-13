import Icon from '../../components/Icon.tsx'
import LogoMark from '../../components/LogoMark.tsx'
import { useT } from '../../i18n/index.ts'
import { useSecondsLeft } from './useAccounts.ts'
import styles from './Sidebar.module.css'

export type Section =
  | 'accounts'
  | 'guard'
  | 'trades'
  | 'inventory'
  | 'tasks'
  | 'proxies'
  | 'add'
  | 'settings'

// Each is named by the section's key in the dictionary.
const SECTIONS: { id: Section; icon: string }[] = [
  {
    id: 'accounts',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  {
    id: 'guard',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  },
  {
    id: 'trades',
    icon: 'M7 7h13l-4-4M17 17H4l4 4',
  },
  {
    id: 'inventory',
    icon: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  },
  {
    id: 'tasks',
    icon: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  },
  {
    id: 'proxies',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z',
  },
  { id: 'add', icon: 'M12 5v14M5 12h14' },
  {
    id: 'settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
]

const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'

type Props = {
  section: Section
  locksAt: number | null
  onSelect: (section: Section) => void
  onLock: () => void
}

export default function Sidebar({ section, locksAt, onSelect, onLock }: Props) {
  const t = useT().sidebar
  return (
    <nav aria-label={t.menu} className={styles.sidebar}>
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
            {t[item.id]}
          </button>
        ))}
      </div>
      <div className={styles.footer}>
        <span className={styles.vault}>
          <span className={styles.vaultState}>{t.vaultUnlocked}</span>
          {locksAt !== null && <LocksIn deadline={locksAt} />}
        </span>
        <button
          type="button"
          className={styles.lock}
          aria-label={t.lock}
          onClick={onLock}
        >
          <Icon path={LOCK} size={15} stroke={1.8} />
        </button>
      </div>
    </nav>
  )
}

function LocksIn({ deadline }: { deadline: number }) {
  const t = useT().sidebar
  const minutes = Math.max(1, Math.ceil(useSecondsLeft(deadline) / 60))
  return <span className={styles.locksIn}>{t.locksIn(minutes)}</span>
}
