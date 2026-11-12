import { useState } from 'react'
import AccountPage from './account/AccountPage.tsx'
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
  const [openName, setOpenName] = useState<string | null>(null)
  const { list, error, reload } = useAccounts()
  const openAccount = list?.accounts.find(
    (account) => account.accountName === openName,
  )

  function select(next: Section) {
    setSection(next)
    setOpenName(null)
  }

  function content() {
    if (!list) return null
    if (section === 'guard') return <SteamGuard list={list} />
    if (openAccount) {
      return (
        <AccountPage
          key={openAccount.accountName}
          account={openAccount}
          codesExpireAt={list.codesExpireAt}
          onBack={() => setOpenName(null)}
          onRemoved={() => {
            setOpenName(null)
            reload()
          }}
        />
      )
    }
    return <Accounts list={list} onImported={reload} onOpen={setOpenName} />
  }

  return (
    <div className={styles.app}>
      <Sidebar section={section} onSelect={select} onLock={onLock} />
      <main className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {content()}
      </main>
    </div>
  )
}
