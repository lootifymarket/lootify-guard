import type { Account } from '../../../api/accounts.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import styles from './TabBar.module.css'

const DASHBOARD_ICON = 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'
const PRIVATE_ICON =
  'M3 11h18M6 11l1.5-5h9l1.5 5M4.5 16.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M14.5 16.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M9.5 16.5h5'

/** An open tab as the bar shows it. */
export type TabInfo = {
  id: string
  title: string
  /** `null` for a private tab, which is signed in to nothing. */
  account: Account | null
  proxy: Proxy | null
}

type Props = {
  /** For the menu: the accounts that can have a tab, and the proxies a private one can use. */
  accounts: Account[]
  proxyOf: (account: Account) => Proxy | null
  proxies: Proxy[]
  tabs: TabInfo[]
  /** `null` for the dashboard. */
  active: string | null
  onSelect: (tab: string | null) => void
  onOpen: (accountName: string) => void
  onOpenPrivate: (proxyId: number | null) => void
  onClose: (tab: string) => void
  /** Whether the account menu is open; it covers the page of a browser tab. */
  menu: boolean
  onMenu: (open: boolean) => void
}

export default function TabBar({
  accounts,
  proxyOf,
  proxies,
  tabs,
  active,
  onSelect,
  onOpen,
  onOpenPrivate,
  onClose,
  menu,
  onMenu,
}: Props) {
  const words = useT()
  const t = words.browser
  const signedIn = accounts.filter((account) => account.signedIn)

  return (
    <div className={styles.bar} role="tablist" aria-label={t.tabs}>
      <button
        type="button"
        role="tab"
        aria-selected={active === null}
        className={styles.tab}
        title={`${t.dashboard} (⌘1)`}
        onClick={() => onSelect(null)}
      >
        <Icon path={DASHBOARD_ICON} size={14} stroke={2} />
        <span>{t.dashboard}</span>
      </button>
      {tabs.map((tab, index) => {
        const { id, title, account, proxy } = tab
        return (
          <div
            key={id}
            role="presentation"
            className={`${styles.tab} ${styles.accountTab}`}
            data-selected={active === id}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active === id}
              className={styles.pick}
              title={`${title} · ${proxy ? proxyTitle(proxy) : t.noProxy}${index < 8 ? ` (⌘${index + 2})` : ''}`}
              onClick={() => onSelect(id)}
            >
              {account === null ? (
                <span className={styles.initials} aria-hidden="true">
                  <Icon path={PRIVATE_ICON} size={12} stroke={2} />
                </span>
              ) : account.avatar ? (
                <img className={styles.avatar} src={account.avatar} alt="" />
              ) : (
                <span className={styles.initials} aria-hidden="true">
                  {title.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className={styles.name}>{title}</span>
              {proxy?.country && (
                <span className={styles.country}>{proxy.country}</span>
              )}
            </button>
            <button
              type="button"
              className={styles.close}
              aria-label={t.close(title)}
              title={active === id ? `${t.close(title)} (⌘W)` : t.close(title)}
              onClick={() => onClose(id)}
            >
              ×
            </button>
          </div>
        )
      })}
      <div className={styles.add}>
        <button
          type="button"
          className={styles.plus}
          aria-label={t.newTab}
          title={`${t.newTab} (⌘T)`}
          aria-expanded={menu}
          onClick={() => onMenu(!menu)}
        >
          +
        </button>
        {menu && (
          <>
            <button
              type="button"
              className={styles.scrim}
              aria-label={words.common.cancel}
              onClick={() => onMenu(false)}
            />
            <div className={`${styles.menu} rise`} role="menu">
              <span className={styles.menuTitle}>{t.pickTitle}</span>
              {signedIn.length === 0 && (
                <span className={styles.menuEmpty}>{t.noAccounts}</span>
              )}
              {signedIn.map((account) => {
                const proxy = proxyOf(account)
                return (
                  <button
                    key={account.accountName}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      onMenu(false)
                      onOpen(account.accountName)
                    }}
                  >
                    <span>{account.accountName}</span>
                    <span className={styles.menuProxy}>
                      {proxy ? proxyTitle(proxy) : t.noProxy}
                    </span>
                  </button>
                )
              })}
              <span className={`${styles.menuTitle} ${styles.menuSection}`}>
                {t.privateTitle}
              </span>
              {[null, ...proxies].map((proxy) => (
                <button
                  key={proxy?.id ?? 'direct'}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    onMenu(false)
                    onOpenPrivate(proxy?.id ?? null)
                  }}
                >
                  <span className={styles.menuPrivate}>
                    <Icon path={PRIVATE_ICON} size={14} stroke={2} />
                    {proxy ? proxyTitle(proxy) : t.noProxy}
                  </span>
                  {proxy?.country && (
                    <span className={styles.menuProxy}>{proxy.country}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <span className={styles.spacer} />
      <span className={styles.shortcuts}>{t.shortcuts}</span>
    </div>
  )
}
