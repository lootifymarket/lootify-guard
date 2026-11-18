import { useState, type KeyboardEvent } from 'react'
import type { Account } from '../../../api/accounts.ts'
import {
  profileTab,
  profileTint,
  type BrowserProfile,
} from '../../../api/browserProfiles.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import { PRIVATE_ICON } from './icons.ts'
import styles from './TabBar.module.css'

const SEARCH_ICON = 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'
const PLUS_ICON = 'M12 5v14M5 12h14'
// A list this long shows whole; a longer one folds behind its header.
const SHOW_ALL_UP_TO = 8
const MAX_FOUND = 30

/** Something the menu can open in a tab. */
type Choice = {
  /** The tab's name. */
  key: string
  label: string
  proxy: Proxy | null
  account: Account | null
  profile: BrowserProfile | null
  open: () => void
}

type Props = {
  /** Signed in to Steam, so they can have a tab. */
  accounts: Account[]
  proxyOf: (account: Account) => Proxy | null
  proxies: Proxy[]
  profiles: BrowserProfile[]
  /** Tab names opened lately, newest first. */
  recent: string[]
  onOpen: (accountName: string) => void
  onOpenProfile: (id: number) => void
  onNewProfile: () => void
  onOpenPrivate: (proxyId: number | null) => void
  onClose: () => void
}

/** What a new tab can show: an account, a profile, or a private tab. */
export default function NewTabMenu({
  accounts,
  proxyOf,
  proxies,
  profiles,
  recent,
  onOpen,
  onOpenProfile,
  onNewProfile,
  onOpenPrivate,
  onClose,
}: Props) {
  const t = useT().browser
  const [query, setQuery] = useState('')
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(true)
  const [privateOpen, setPrivateOpen] = useState(false)

  const pick = (open: () => void) => () => {
    onClose()
    open()
  }
  const accountChoices: Choice[] = accounts.map((account) => ({
    key: account.accountName,
    label: account.accountName,
    proxy: proxyOf(account),
    account,
    profile: null,
    open: pick(() => onOpen(account.accountName)),
  }))
  const profileChoices: Choice[] = profiles.map((profile) => ({
    key: profileTab(profile.id),
    label: profile.name,
    proxy: proxies.find((proxy) => proxy.id === profile.proxyId) ?? null,
    account: null,
    profile,
    open: pick(() => onOpenProfile(profile.id)),
  }))
  const all = [...accountChoices, ...profileChoices]
  const needle = query.trim().toLowerCase()
  const found = needle
    ? all
        .filter((choice) => choice.label.toLowerCase().includes(needle))
        .slice(0, MAX_FOUND)
    : []
  const recentChoices = recent.flatMap((key) =>
    all.filter((choice) => choice.key === key),
  )
  const accountsFold = accountChoices.length > SHOW_ALL_UP_TO
  const showAccounts = !accountsFold || accountsOpen

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') found[0]?.open()
  }

  return (
    <div className={`${styles.menu} rise`} role="menu">
      <div className={styles.menuSearch}>
        <Icon path={SEARCH_ICON} size={14} stroke={2} />
        <input
          // Opened with ⌘T to type a name straight away.
          autoFocus
          className={styles.menuInput}
          aria-label={t.find}
          placeholder={t.find}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
        />
      </div>

      <div className={styles.menuList}>
        {needle ? (
          <>
            <span className={styles.menuTitle}>
              {found.length > 0 ? t.enterOpensFirst : t.noMatches}
            </span>
            {found.map((choice, index) => (
              <Item key={choice.key} choice={choice} first={index === 0} />
            ))}
          </>
        ) : (
          <>
            {recentChoices.length > 0 && (
              <>
                <span className={styles.menuTitle}>{t.recent}</span>
                {recentChoices.map((choice) => (
                  <Item key={choice.key} choice={choice} />
                ))}
              </>
            )}
            <Fold
              title={t.accountsHead(accountChoices.length)}
              folds={accountsFold}
              open={showAccounts}
              onToggle={() => setAccountsOpen(!accountsOpen)}
            />
            {accountChoices.length === 0 && (
              <span className={styles.menuEmpty}>{t.noAccounts}</span>
            )}
            {showAccounts && accountChoices.length > 0 && (
              <div className={accountsFold ? styles.menuNested : undefined}>
                {accountChoices.map((choice) => (
                  <Item key={choice.key} choice={choice} />
                ))}
              </div>
            )}
            <Fold
              title={t.profilesHead(profileChoices.length)}
              folds={profileChoices.length > 0}
              open={profilesOpen}
              onToggle={() => setProfilesOpen(!profilesOpen)}
            />
            {(profilesOpen || profileChoices.length === 0) && (
              <>
                {profileChoices.map((choice) => (
                  <Item key={choice.key} choice={choice} />
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuQuiet}`}
                  onClick={pick(onNewProfile)}
                >
                  <span className={styles.menuLabel}>
                    <Icon path={PLUS_ICON} size={14} stroke={2} />
                    {t.newProfile}
                  </span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className={styles.menuFoot}>
        {privateOpen && (
          <>
            <span className={styles.menuTitle}>{t.privateThrough}</span>
            {[null, ...proxies].map((proxy) => (
              <button
                key={proxy?.id ?? 'direct'}
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${styles.menuSmall}`}
                onClick={pick(() => onOpenPrivate(proxy?.id ?? null))}
              >
                <span className={styles.menuLabel}>
                  {proxy ? proxyTitle(proxy) : t.noProxy}
                </span>
                {proxy?.country && (
                  <span className={styles.menuProxy}>{proxy.country}</span>
                )}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          role="menuitem"
          aria-expanded={privateOpen}
          className={styles.menuItem}
          onClick={() => setPrivateOpen(!privateOpen)}
        >
          <span className={styles.menuLabel}>
            <Icon path={PRIVATE_ICON} size={14} stroke={2} />
            {t.privateTab}
          </span>
          <span className={styles.menuProxy}>{t.notSaved}</span>
        </button>
      </div>
    </div>
  )
}

function Fold({
  title,
  folds,
  open,
  onToggle,
}: {
  title: string
  folds: boolean
  open: boolean
  onToggle: () => void
}) {
  const t = useT().browser
  if (!folds) return <span className={styles.menuTitle}>{title}</span>
  return (
    <button
      type="button"
      className={styles.menuFold}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span>{title}</span>
      <span>{open ? t.hideList : t.showList}</span>
    </button>
  )
}

function Item({ choice, first = false }: { choice: Choice; first?: boolean }) {
  const t = useT().browser
  const { account, profile, proxy } = choice
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      data-first={first || undefined}
      onClick={choice.open}
    >
      <span className={styles.menuLabel}>
        {profile ? (
          <span
            className={styles.profileMark}
            style={{ background: profileTint(profile.id) }}
            aria-hidden="true"
          >
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
        ) : account?.avatar ? (
          <img className={styles.menuAvatar} src={account.avatar} alt="" />
        ) : (
          <span className={styles.menuInitials} aria-hidden="true">
            {choice.label.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className={styles.menuName}>{choice.label}</span>
      </span>
      <span className={styles.menuProxy}>
        {proxy ? proxyTitle(proxy) : t.noProxy}
      </span>
    </button>
  )
}
