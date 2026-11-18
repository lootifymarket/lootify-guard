import type { Account } from '../../../api/accounts.ts'
import type { BrowserProfile } from '../../../api/browserProfiles.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import { PRIVATE_ICON } from './icons.ts'
import NewTabMenu from './NewTabMenu.tsx'
import styles from './TabBar.module.css'

const DASHBOARD_ICON = 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'

/** An open tab as the bar shows it. */
export type TabInfo = {
  id: string
  kind: 'account' | 'profile' | 'private'
  title: string
  /** `null` unless the tab is an account's. */
  account: Account | null
  proxy: Proxy | null
  /** A profile's colour. */
  tint?: string
}

type Props = {
  /** For the menu: the accounts that can have a tab, and the proxies a private one can use. */
  accounts: Account[]
  proxyOf: (account: Account) => Proxy | null
  proxies: Proxy[]
  profiles: BrowserProfile[]
  /** Tab names opened lately, newest first. */
  recent: string[]
  tabs: TabInfo[]
  /** `null` for the dashboard. */
  active: string | null
  onSelect: (tab: string | null) => void
  onOpen: (accountName: string) => void
  onOpenProfile: (id: number) => void
  onNewProfile: () => void
  onOpenPrivate: (proxyId: number | null) => void
  onClose: (tab: string) => void
  /** Whether the new tab menu is open; it covers the page of a browser tab. */
  menu: boolean
  onMenu: (open: boolean) => void
}

export default function TabBar({
  accounts,
  proxyOf,
  proxies,
  profiles,
  recent,
  tabs,
  active,
  onSelect,
  onOpen,
  onOpenProfile,
  onNewProfile,
  onOpenPrivate,
  onClose,
  menu,
  onMenu,
}: Props) {
  const words = useT()
  const t = words.browser

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
        const { id, kind, title, account, proxy, tint } = tab
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
              {kind === 'private' ? (
                <span className={styles.initials} aria-hidden="true">
                  <Icon path={PRIVATE_ICON} size={12} stroke={2} />
                </span>
              ) : kind === 'profile' ? (
                <span
                  className={styles.profileMark}
                  style={{ background: tint }}
                  aria-hidden="true"
                >
                  {title.slice(0, 1).toUpperCase()}
                </span>
              ) : account?.avatar ? (
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
            <NewTabMenu
              accounts={accounts.filter((account) => account.signedIn)}
              proxyOf={proxyOf}
              proxies={proxies}
              profiles={profiles}
              recent={recent}
              onOpen={onOpen}
              onOpenProfile={onOpenProfile}
              onNewProfile={onNewProfile}
              onOpenPrivate={onOpenPrivate}
              onClose={() => onMenu(false)}
            />
          </>
        )}
      </div>
      <span className={styles.spacer} />
      <span className={styles.shortcuts}>{t.shortcuts}</span>
    </div>
  )
}
