import { useState } from 'react'
import Accounts from './Accounts.tsx'
import Sidebar, { type Section } from './Sidebar.tsx'
import SteamGuard from './SteamGuard.tsx'
import { useAccounts } from './useAccounts.ts'
import styles from './Main.module.css'

type Props = {
  onLock: () => void
}

export default function Main({ onLock }: Props) {
  const [section, setSection] = useState<Section>('accounts')
  const { list, error, reload } = useAccounts()

  return (
    <div className={styles.app}>
      <Sidebar section={section} onSelect={setSection} onLock={onLock} />
      <main className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {list &&
          (section === 'accounts' ? (
            <Accounts list={list} onImported={reload} />
          ) : (
            <SteamGuard list={list} />
          ))}
      </main>
    </div>
  )
}
