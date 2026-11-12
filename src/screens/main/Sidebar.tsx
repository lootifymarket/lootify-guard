import Icon from '../../components/Icon.tsx'
import LogoMark from '../../components/LogoMark.tsx'
import styles from './Sidebar.module.css'

export type Section = 'accounts' | 'guard'

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
]

const LOCK = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'

type Props = {
  section: Section
  onSelect: (section: Section) => void
  onLock: () => void
}

export default function Sidebar({ section, onSelect, onLock }: Props) {
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
        <span className={styles.vault}>Vault unlocked</span>
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
