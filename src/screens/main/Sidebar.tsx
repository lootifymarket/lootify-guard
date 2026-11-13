import { useEffect, useState } from 'react'
import Icon from '../../components/Icon.tsx'
import LogoMark from '../../components/LogoMark.tsx'
import { appVersion } from '../../api/settings.ts'
import { useT } from '../../i18n/index.ts'
import { useStreamerMode } from '../../lib/streamer.ts'
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
    icon: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  },
  {
    id: 'inventory',
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12',
  },
  {
    id: 'tasks',
    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  },
  {
    id: 'proxies',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z',
  },
  { id: 'add', icon: 'M12 5v14M5 12h14' },
  {
    id: 'settings',
    icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
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
  const streamer = useStreamerMode()
  const [version, setVersion] = useState('')

  useEffect(() => {
    void appVersion().then(setVersion)
  }, [])

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
        {streamer.on && (
          <button
            type="button"
            className={styles.streamer}
            title={t.streamerOff}
            onClick={() => void streamer.set(false)}
          >
            <span className={styles.streamerDot} />
            {t.streamerOn}
          </button>
        )}
        <span className={styles.rule} />
        <div className={styles.vaultRow}>
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
        {version && (
          <span className={styles.version}>{t.version(version)}</span>
        )}
      </div>
    </nav>
  )
}

function LocksIn({ deadline }: { deadline: number }) {
  const t = useT().sidebar
  const minutes = Math.max(1, Math.ceil(useSecondsLeft(deadline) / 60))
  return <span className={styles.locksIn}>{t.locksIn(minutes)}</span>
}
