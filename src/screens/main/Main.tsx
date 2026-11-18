import { useEffect, useEffectEvent, useState } from 'react'
import type { Account } from '../../api/accounts.ts'
import {
  closeBrowser,
  isPrivateTab,
  openPrivateBrowser,
} from '../../api/browser.ts'
import {
  listBrowserProfiles,
  openProfileBrowser,
  profileOfTab,
  profileTab,
  profileTint,
  type BrowserProfile,
} from '../../api/browserProfiles.ts'
import { errorMessage } from '../../api/vault.ts'
import { listProxies, type Proxy } from '../../api/proxies.ts'
import {
  getSettings,
  type Settings as SettingsValues,
} from '../../api/settings.ts'
import { dismissInstalledUpdate } from '../../api/updates.ts'
import { useT } from '../../i18n/index.ts'
import { useToast } from '../../lib/toast.ts'
import AccountPage from './account/AccountPage.tsx'
import AddAccount from './add/AddAccount.tsx'
import Accounts from './Accounts.tsx'
import BrowserTab from './browser/BrowserTab.tsx'
import TabBar, { type TabInfo } from './browser/TabBar.tsx'
import Inventory from './inventory/Inventory.tsx'
import Profiles from './profiles/Profiles.tsx'
import Proxies from './proxies/Proxies.tsx'
import Sidebar, { type Section } from './Sidebar.tsx'
import SteamGuard from './SteamGuard.tsx'
import Settings from './settings/Settings.tsx'
import Tasks from './tasks/Tasks.tsx'
import Trades from './trades/Trades.tsx'
import UpdateDialog from './UpdateDialog.tsx'
import { useAccounts } from './useAccounts.ts'
import { useAutoLock } from './useAutoLock.ts'
import { useUpdates } from './useUpdates.ts'
import styles from './Main.module.css'

// How many tabs the new tab menu lists as recent.
const RECENT_TABS = 5

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
  // The proxy each private tab was opened with, by tab name.
  const [privateProxies, setPrivateProxies] = useState<
    Record<string, number | null>
  >({})
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  // Tabs opened lately, newest first, for the new tab menu. Kept in memory only:
  // the names would say which accounts are in the vault.
  const [recent, setRecent] = useState<string[]>([])
  const updates = useUpdates()
  const [updateOpen, setUpdateOpen] = useState(false)
  // The version this restart installed, said once and then forgotten.
  const [installed, setInstalled] =
    useState<SettingsValues['installedUpdate']>(null)
  const [installedNoted, setInstalledNoted] = useState(false)
  const words = useT()
  const t = words.updates
  const toast = useToast()
  const openAccount = list?.accounts.find(
    (account) => account.accountName === openName,
  )
  // A removed account's tab went with it.
  const shownTabs = list
    ? tabs.filter(
        (name) =>
          isPrivateTab(name) ||
          profileOfTab(name) !== null ||
          list.accounts.some((account) => account.accountName === name),
      )
    : tabs
  const browsing =
    activeTab !== null && shownTabs.includes(activeTab) ? activeTab : null

  // Proxies and profiles change on their own screens, so they're read again
  // with the tabs and the screen.
  useEffect(() => {
    let active = true
    Promise.all([listProxies(), listBrowserProfiles()]).then(
      ([nextProxies, nextProfiles]) => {
        if (!active) return
        setProxies(nextProxies)
        setProfiles(nextProfiles)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [tabs, tabMenu, section])

  useEffect(() => {
    let active = true
    getSettings().then(
      (settings) => {
        if (active) setInstalled(settings.installedUpdate)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [])

  function forgetInstalled() {
    setInstalled(null)
    void dismissInstalledUpdate()
  }

  /** Acts on a browser-like shortcut by its name: `new`, `close`, or a tab number from 1. */
  const onShortcut = useEffectEvent((name: string) => {
    if (name === 'new') {
      setTabMenu(true)
    } else if (name === 'close') {
      if (browsing) closeTab(browsing)
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

  /** Shows the tab, adding it to the bar if it isn't there yet. */
  function show(tab: string) {
    setTabs((open) => (open.includes(tab) ? open : [...open, tab]))
    setActiveTab(tab)
    setRecent((last) =>
      [tab, ...last.filter((each) => each !== tab)].slice(0, RECENT_TABS),
    )
  }

  function browse(accountName: string) {
    show(accountName)
  }

  function browseProfile(id: number) {
    openProfileBrowser(id).then(show, (err: unknown) =>
      toast(errorMessage(err)),
    )
  }

  function browsePrivate(proxyId: number | null) {
    openPrivateBrowser(proxyId).then(
      (tab) => {
        setPrivateProxies((open) => ({ ...open, [tab]: proxyId }))
        setTabs((open) => [...open, tab])
        setActiveTab(tab)
      },
      (err: unknown) => toast(errorMessage(err)),
    )
  }

  function closeTab(tab: string) {
    void closeBrowser(tab)
    const index = tabs.indexOf(tab)
    const rest = tabs.filter((name) => name !== tab)
    setTabs(rest)
    if (activeTab === tab) {
      setActiveTab(rest[index] ?? rest[index - 1] ?? null)
    }
  }

  const proxyOf = (account: Account) =>
    proxies.find((proxy) => proxy.id === account.proxyId) ?? null

  function tabInfo(tab: string): TabInfo {
    if (isPrivateTab(tab)) {
      const proxyId = privateProxies[tab] ?? null
      return {
        id: tab,
        kind: 'private',
        title: words.browser.privateName(Number(tab.split(':')[1])),
        account: null,
        proxy: proxies.find((proxy) => proxy.id === proxyId) ?? null,
      }
    }
    const profileId = profileOfTab(tab)
    if (profileId !== null) {
      const profile = profiles.find((each) => each.id === profileId)
      return {
        id: tab,
        kind: 'profile',
        title: profile?.name ?? words.profiles.title,
        account: null,
        proxy: proxies.find((proxy) => proxy.id === profile?.proxyId) ?? null,
        tint: profileTint(profileId),
      }
    }
    const account =
      list?.accounts.find((each) => each.accountName === tab) ?? null
    return {
      id: tab,
      kind: 'account',
      title: tab,
      account,
      proxy: account ? proxyOf(account) : null,
    }
  }

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
    if (section === 'profiles') {
      return (
        <Profiles
          accounts={list.accounts}
          onOpen={browseProfile}
          onOpenAccount={browse}
          onShowAccount={(accountName) => {
            select('accounts')
            setOpenName(accountName)
          }}
          onRemoved={(id) => {
            if (tabs.includes(profileTab(id))) closeTab(profileTab(id))
          }}
          onAccountsChanged={reload}
        />
      )
    }
    if (section === 'settings') {
      return (
        <Settings
          update={updates.status}
          onUpdate={() => setUpdateOpen(true)}
          onUpdateChanged={updates.refresh}
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
        update={updates.status}
        onUpdate={() => setUpdateOpen(true)}
        section={section}
        locksAt={locksAt}
        onSelect={select}
        onLock={onLock}
      />
      <div className={styles.column}>
        <TabBar
          accounts={list?.accounts ?? []}
          proxyOf={proxyOf}
          proxies={proxies}
          profiles={profiles}
          recent={recent}
          tabs={shownTabs.map(tabInfo)}
          active={browsing}
          onSelect={setActiveTab}
          onOpen={browse}
          onOpenProfile={browseProfile}
          onNewProfile={() => select('profiles')}
          onOpenPrivate={browsePrivate}
          onClose={closeTab}
          menu={tabMenu}
          onMenu={setTabMenu}
        />
        {browsing && list ? (
          <BrowserTab
            key={browsing}
            tab={browsing}
            kind={tabInfo(browsing).kind}
            account={tabInfo(browsing).account}
            proxy={tabInfo(browsing).proxy}
            codesExpireAt={list.codesExpireAt}
            covered={tabMenu || updateOpen}
            onClose={() => closeTab(browsing)}
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
      <UpdateDialog
        open={updateOpen}
        status={updates.status}
        installed={installedNoted ? installed : null}
        openTabs={shownTabs.length}
        onClose={() => {
          setUpdateOpen(false)
          if (installedNoted) forgetInstalled()
        }}
        onChanged={updates.refresh}
      />
      {installed && !installedNoted && (
        <div className={`${styles.updated} rise`} role="status">
          {t.updated(installed.version)}
          <button
            type="button"
            className={styles.updatedNotes}
            onClick={() => {
              setInstalledNoted(true)
              setUpdateOpen(true)
            }}
          >
            {t.whatsNew}
          </button>
          <button
            type="button"
            className={styles.updatedClose}
            aria-label={t.close}
            onClick={forgetInstalled}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
