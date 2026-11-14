import { useEffect, useEffectEvent, useState } from 'react'
import type { Account } from '../../api/accounts.ts'
import { closeBrowser } from '../../api/browser.ts'
import { listProxies, type Proxy } from '../../api/proxies.ts'
import AccountPage from './account/AccountPage.tsx'
import AddAccount from './add/AddAccount.tsx'
import Accounts from './Accounts.tsx'
import BrowserTab from './browser/BrowserTab.tsx'
import TabBar from './browser/TabBar.tsx'
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
  sidebarCollapsed: boolean
  onSidebarCollapse: (collapsed: boolean) => void
  onLock: () => void
  /** The backend has already locked the vault; only the screen is left to change. */
  onAutoLocked: () => void
}

export default function Main({
  sidebarCollapsed,
  onSidebarCollapse,
  onLock,
  onAutoLocked,
}: Props) {
  const [section, setSection] = useState<Section>('accounts')
  const [openName, setOpenName] = useState<string | null>(null)
  const { list, error, reload } = useAccounts()
  const [autoLockVersion, setAutoLockVersion] = useState(0)
  const locksAt = useAutoLock(onAutoLocked, autoLockVersion)
  const [tabs, setTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [tabMenu, setTabMenu] = useState(false)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const openAccount = list?.accounts.find(
    (account) => account.accountName === openName,
  )
  const browsing = list?.accounts.find(
    (account) => account.accountName === activeTab,
  )
  // A removed account's tab went with it.
  const shownTabs = list
    ? tabs.filter((name) =>
        list.accounts.some((account) => account.accountName === name),
      )
    : tabs

  // Proxies can change on their own screen, so they're read again with the tabs.
  useEffect(() => {
    let active = true
    listProxies().then(
      (next) => {
        if (active) setProxies(next)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [tabs, tabMenu])

  /** Acts on a browser-like shortcut by its name: `new`, `close`, or a tab number from 1. */
  const onShortcut = useEffectEvent((name: string) => {
    if (name === 'new') {
      setTabMenu(true)
    } else if (name === 'close') {
      if (browsing) closeTab(browsing.accountName)
    } else {
      // 1 is the dashboard, then the tabs in order.
      const index = Number(name) - 2
      if (index < shownTabs.length) {
        setActiveTab(index < 0 ? null : shownTabs[index])
      }
    }
  })

  useEffect(() => {
    // Keys pressed in the app's own page. On macOS the menu bar takes them first
    // and sends them on as `app-shortcut`, from a Steam page too.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTabMenu(false)
        return
      }
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      const name =
        key === 't'
          ? 'new'
          : key === 'w'
            ? 'close'
            : /^[1-9]$/.test(key)
              ? key
              : null
      if (name === null) return
      event.preventDefault()
      onShortcut(name)
    }
    function onMenu(event: Event) {
      onShortcut((event as CustomEvent<string>).detail)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('app-shortcut', onMenu)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('app-shortcut', onMenu)
    }
  }, [])

  function select(next: Section) {
    setSection(next)
    setOpenName(null)
    setActiveTab(null)
  }

  function browse(accountName: string) {
    setTabs((open) =>
      open.includes(accountName) ? open : [...open, accountName],
    )
    setActiveTab(accountName)
  }

  function closeTab(accountName: string) {
    void closeBrowser(accountName)
    const index = tabs.indexOf(accountName)
    const rest = tabs.filter((name) => name !== accountName)
    setTabs(rest)
    if (activeTab === accountName) {
      setActiveTab(rest[index] ?? rest[index - 1] ?? null)
    }
  }

  const proxyOf = (account: Account) =>
    proxies.find((proxy) => proxy.id === account.proxyId) ?? null

  function content() {
    if (!list) {
      return section === 'accounts' ? (
        <Accounts
          list={null}
          onImported={reload}
          onChanged={reload}
          onOpen={setOpenName}
          onAdd={() => select('add')}
          onGuard={() => select('guard')}
          onBrowse={browse}
        />
      ) : null
    }
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
          onBrowse={() => browse(openAccount.accountName)}
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
        onGuard={() => select('guard')}
        onBrowse={browse}
      />
    )
  }

  return (
    <div className={styles.app}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={onSidebarCollapse}
        section={section}
        locksAt={locksAt}
        onSelect={select}
        onLock={onLock}
      />
      <div className={styles.column}>
        <TabBar
          accounts={list?.accounts ?? []}
          proxyOf={proxyOf}
          tabs={shownTabs}
          active={browsing ? browsing.accountName : null}
          onSelect={setActiveTab}
          onOpen={browse}
          onClose={closeTab}
          menu={tabMenu}
          onMenu={setTabMenu}
        />
        {browsing && list ? (
          <BrowserTab
            key={browsing.accountName}
            account={browsing}
            proxy={proxyOf(browsing)}
            codesExpireAt={list.codesExpireAt}
            covered={tabMenu}
            onClose={() => closeTab(browsing.accountName)}
          />
        ) : (
          <main className={styles.content}>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {content()}
          </main>
        )}
      </div>
    </div>
  )
}
