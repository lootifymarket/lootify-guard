import { useState } from 'react'
import AccountPage from './account/AccountPage.tsx'
import AddAccount from './add/AddAccount.tsx'
import Accounts from './Accounts.tsx'
import Inventory from './inventory/Inventory.tsx'
import Proxies from './proxies/Proxies.tsx'
import Sidebar, { type Section } from './Sidebar.tsx'
import SteamGuard from './SteamGuard.tsx'
import Settings from './settings/Settings.tsx'
import Tasks from './tasks/Tasks.tsx'
import Trades from './trades/Trades.tsx'
import { useAccounts } from './useAccounts.ts'
import { useAutoLock } from './useAutoLock.ts'
import styles from './Main.module.css'

type Props = {
  onLock: () => void
  /** The backend has already locked the vault; only the screen is left to change. */
  onAutoLocked: () => void
}

export default function Main({ onLock, onAutoLocked }: Props) {
  const [section, setSection] = useState<Section>('accounts')
  const [openName, setOpenName] = useState<string | null>(null)
  const { list, error, reload } = useAccounts()
  const [autoLockVersion, setAutoLockVersion] = useState(0)
  const locksAt = useAutoLock(onAutoLocked, autoLockVersion)
  const openAccount = list?.accounts.find(
    (account) => account.accountName === openName,
  )

  function select(next: Section) {
    setSection(next)
    setOpenName(null)
  }

  function content() {
    if (!list) return null
    if (section === 'guard') {
      return <SteamGuard list={list} onChanged={reload} />
    }
    if (section === 'trades') {
      return <Trades accounts={list.accounts} onChanged={reload} />
    }
    if (section === 'inventory') {
      return (
        <Inventory
          accounts={list.accounts}
          groups={list.groups}
          onChanged={reload}
        />
      )
    }
    if (section === 'tasks') {
      return <Tasks accounts={list.accounts} groups={list.groups} />
    }
    if (section === 'proxies') return <Proxies />
    if (section === 'settings') {
      return (
        <Settings
          onAutoLockChanged={() => setAutoLockVersion((version) => version + 1)}
        />
      )
    }
    if (section === 'add') {
      return (
        <AddAccount
          onCancel={() => select('accounts')}
          onAdded={reload}
          onDone={(accountName) => {
            setSection('accounts')
            setOpenName(accountName)
          }}
        />
      )
    }
    if (openAccount) {
      return (
        <AccountPage
          key={openAccount.accountName}
          account={openAccount}
          accounts={list.accounts}
          groups={list.groups}
          codesExpireAt={list.codesExpireAt}
          onBack={() => setOpenName(null)}
          onChanged={reload}
          onRemoved={() => {
            setOpenName(null)
            reload()
          }}
        />
      )
    }
    return (
      <Accounts
        list={list}
        onImported={reload}
        onChanged={reload}
        onOpen={setOpenName}
        onAdd={() => select('add')}
      />
    )
  }

  return (
    <div className={styles.app}>
      <Sidebar
        section={section}
        locksAt={locksAt}
        onSelect={select}
        onLock={onLock}
      />
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
