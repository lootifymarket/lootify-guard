import type { Account } from '../../../api/accounts.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import styles from './TabBar.module.css'

const DASHBOARD_ICON = 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'

type Props = {
  accounts: Account[]
  proxyOf: (account: Account) => Proxy | null
  tabs: string[]
  /** `null` for the dashboard. */
  active: string | null
  onSelect: (accountName: string | null) => void
  onOpen: (accountName: string) => void
  onClose: (accountName: string) => void
  /** Whether the account menu is open; it covers the page of a browser tab. */
  menu: boolean
  onMenu: (open: boolean) => void
}

export default function TabBar({
  accounts,
  proxyOf,
  tabs,
  active,
  onSelect,
  onOpen,
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
      {tabs.map((name, index) => {
        const account = accounts.find((each) => each.accountName === name)
        const proxy = account ? proxyOf(account) : null
        return (
          <div
            key={name}
            role="presentation"
            className={`${styles.tab} ${styles.accountTab}`}
            data-selected={active === name}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active === name}
              className={styles.pick}
              title={`${name} · ${proxy ? proxyTitle(proxy) : t.noProxy}${index < 8 ? ` (⌘${index + 2})` : ''}`}
              onClick={() => onSelect(name)}
            >
              {account?.avatar ? (
                <img className={styles.avatar} src={account.avatar} alt="" />
              ) : (
                <span className={styles.initials} aria-hidden="true">
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className={styles.name}>{name}</span>
              {proxy?.country && (
                <span className={styles.country}>{proxy.country}</span>
              )}
            </button>
            <button
              type="button"
              className={styles.close}
              aria-label={t.close(name)}
              title={active === name ? `${t.close(name)} (⌘W)` : t.close(name)}
              onClick={() => onClose(name)}
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
            </div>
          </>
        )}
      </div>
      <span className={styles.spacer} />
      <span className={styles.shortcuts}>{t.shortcuts}</span>
    </div>
  )
}
