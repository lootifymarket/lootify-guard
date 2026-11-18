import { useEffect, useState, type ReactNode } from 'react'
import type { Account } from '../../../api/accounts.ts'
import type { Region, RegionChoice } from '../../../api/browser.ts'
import {
  listBrowserProfiles,
  profileTint,
  type BrowserProfile,
} from '../../../api/browserProfiles.ts'
import { listProxies, proxyTitle, type Proxy } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Avatar from '../../../components/Avatar.tsx'
import Button from '../../../components/Button.tsx'
import Flag from '../../../components/Flag.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT } from '../../../i18n/index.ts'
import { ago } from '../../../lib/ago.ts'
import { useToast } from '../../../lib/toast.ts'
import layout from '../layout.module.css'
import { regionName, resolveRegion, useRegions } from '../browser/regions.ts'
import AccountBrowserDialog from './AccountBrowserDialog.tsx'
import ProfileDialog from './ProfileDialog.tsx'
import styles from './Profiles.module.css'

const SKELETON_ROWS = 3
// A farm's worth of accounts shows only those set up for the browser, until asked.
const SHOW_ALL_ACCOUNTS_UP_TO = 20

type Props = {
  /** Every account in the vault. */
  accounts: Account[]
  /** Opens the profile's tab. */
  onOpen: (id: number) => void
  /** Opens the account's tab. */
  onOpenAccount: (accountName: string) => void
  /** Goes to the account's page, where its proxy is set. */
  onShowAccount: (accountName: string) => void
  /** The profile is gone, so its tab is. */
  onRemoved: (id: number) => void
  /** An account's browser settings changed; the list should be read again. */
  onAccountsChanged: () => void
}

/**
 * Every browser tab that keeps its sign-ins: profiles signed in to no Steam
 * account, and each account's own tab.
 */
export default function Profiles({
  accounts,
  onOpen,
  onOpenAccount,
  onShowAccount,
  onRemoved,
  onAccountsChanged,
}: Props) {
  const words = useT()
  const t = words.profiles
  const toast = useToast()
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  // `null` while closed; `'new'` for a new one.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [allAccounts, setAllAccounts] = useState(false)
  const reload = () => setRevision((r) => r + 1)
  const regions = useRegions()

  useEffect(() => {
    let active = true
    Promise.all([listBrowserProfiles(), listProxies()]).then(
      ([nextProfiles, nextProxies]) => {
        if (!active) return
        setProfiles(nextProfiles)
        setProxies(nextProxies)
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err))
      },
    )
    return () => {
      active = false
    }
  }, [revision])

  const current =
    typeof editing === 'number'
      ? (profiles?.find((profile) => profile.id === editing) ?? null)
      : null
  const currentAccount = accounts.find(
    (account) => account.accountName === editingAccount,
  )
  const needle = query.trim().toLowerCase()
  const matches = (name: string) => name.toLowerCase().includes(needle)
  const shownProfiles = profiles?.filter((profile) => matches(profile.name))
  const foundAccounts = accounts.filter((account) =>
    matches(account.accountName),
  )
  // Folding only hides accounts nothing was set for; a search shows them all.
  const folds =
    needle === '' &&
    !allAccounts &&
    foundAccounts.length > SHOW_ALL_ACCOUNTS_UP_TO
  const shownAccounts = folds
    ? foundAccounts.filter(
        (account) =>
          account.savedSites > 0 || account.browserRegion.kind !== 'matchProxy',
      )
    : foundAccounts
  const proxyOf = (id: number | null) =>
    proxies.find((proxy) => proxy.id === id) ?? null

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          {profiles ? (
            <span className={styles.summary}>
              {t.summary(accounts.length, profiles.length)}
            </span>
          ) : (
            <Skeleton width={200} height={13} />
          )}
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          {t.newProfile}
        </Button>
      </div>

      <input
        className={`${layout.search} ${styles.search}`}
        type="search"
        aria-label={t.find}
        placeholder={t.find}
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.table} aria-labelledby="without-steam">
        <h2 id="without-steam" className={styles.sectionTitle}>
          {t.withoutSteam(profiles?.length ?? 0)}
        </h2>
        {profiles?.length === 0 ? (
          <div className={`${styles.empty} rise`}>
            <p className={styles.muted}>{t.emptyText}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing('new')}
            >
              {t.newProfile}
            </Button>
          </div>
        ) : (
          <>
            <Head />
            {shownProfiles === undefined
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <div key={i} className={styles.row}>
                    <Skeleton width={160} height={12} />
                    <Skeleton width={120} height={12} />
                    <Skeleton width={130} height={12} />
                    <Skeleton width={60} height={12} />
                    <Skeleton width={60} height={12} />
                    <span />
                  </div>
                ))
              : shownProfiles.map((profile) => (
                  <Row
                    key={profile.id}
                    name={profile.name}
                    mark={
                      <span
                        className={styles.mark}
                        style={{ background: profileTint(profile.id) }}
                        aria-hidden="true"
                      >
                        {profile.name.slice(0, 1).toUpperCase()}
                      </span>
                    }
                    proxyId={profile.proxyId}
                    proxies={proxies}
                    region={regionText(
                      regions,
                      profile.region,
                      proxyOf(profile.proxyId)?.country ?? null,
                      words.browser.thisComputer,
                    )}
                    savedSites={profile.savedSites}
                    lastOpened={lastOpened(
                      t,
                      words.time.justNow,
                      profile.lastOpened,
                    )}
                    onEdit={() => setEditing(profile.id)}
                    onOpen={() => onOpen(profile.id)}
                  />
                ))}
            {shownProfiles?.length === 0 && (
              <p className={layout.note}>{t.noMatches}</p>
            )}
          </>
        )}
      </section>

      {accounts.length > 0 && (
        <section className={styles.table} aria-labelledby="steam-accounts">
          <h2 id="steam-accounts" className={styles.sectionTitle}>
            {t.steamAccounts(accounts.length)}
          </h2>
          <Head />
          {shownAccounts.map((account) => (
            <Row
              key={account.accountName}
              name={account.accountName}
              mark={
                <span className={styles.accountMark}>
                  <Avatar
                    name={account.accountName}
                    src={account.avatar}
                    size="sm"
                  />
                </span>
              }
              proxyId={account.proxyId}
              proxies={proxies}
              region={regionText(
                regions,
                account.browserRegion,
                proxyOf(account.proxyId)?.country ?? null,
                words.browser.thisComputer,
              )}
              savedSites={account.savedSites}
              lastOpened="—"
              openTitle={account.signedIn ? undefined : t.signInFirst}
              onEdit={() => setEditingAccount(account.accountName)}
              onOpen={
                account.signedIn
                  ? () => onOpenAccount(account.accountName)
                  : null
              }
            />
          ))}
          {folds && (
            <button
              type="button"
              className={styles.more}
              onClick={() => setAllAccounts(true)}
            >
              {t.showAllAccounts(foundAccounts.length)}
            </button>
          )}
          {needle !== '' && foundAccounts.length === 0 && (
            <p className={layout.note}>{t.noMatches}</p>
          )}
        </section>
      )}

      <p className={styles.note}>{t.note}</p>

      {editing !== null && (
        <ProfileDialog
          profile={current}
          proxies={proxies}
          onClose={() => setEditing(null)}
          onCreated={(id) => {
            setEditing(null)
            reload()
            onOpen(id)
          }}
          onSaved={() => {
            setEditing(null)
            reload()
            toast(t.saved)
          }}
          onCleared={() => {
            reload()
            toast(t.cleared)
          }}
          onRemoved={(id) => {
            setEditing(null)
            reload()
            onRemoved(id)
            toast(t.deleted)
          }}
        />
      )}
      {currentAccount && (
        <AccountBrowserDialog
          account={currentAccount}
          proxy={proxyOf(currentAccount.proxyId)}
          onClose={() => setEditingAccount(null)}
          onChanged={onAccountsChanged}
          onShowAccount={() => onShowAccount(currentAccount.accountName)}
        />
      )}
    </>
  )
}

function Head() {
  const t = useT().profiles
  return (
    <div className={`${styles.row} ${styles.head}`}>
      <span>{t.columns.profile}</span>
      <span>{t.columns.proxy}</span>
      <span>{t.columns.region}</span>
      <span>{t.columns.signIns}</span>
      <span>{t.columns.lastOpened}</span>
      <span />
    </div>
  )
}

function Row({
  name,
  mark,
  proxyId,
  proxies,
  region,
  savedSites,
  lastOpened,
  openTitle,
  onEdit,
  onOpen,
}: {
  name: string
  mark: ReactNode
  proxyId: number | null
  proxies: Proxy[]
  region: string
  savedSites: number
  lastOpened: string
  openTitle?: string
  onEdit: () => void
  /** `null` when the tab can't open. */
  onOpen: (() => void) | null
}) {
  const t = useT().profiles
  return (
    <div className={`${styles.row} rise`}>
      <span className={styles.name}>
        {mark}
        <button
          type="button"
          className={styles.edit}
          title={t.edit(name)}
          onClick={onEdit}
        >
          {name}
        </button>
      </span>
      <ProxyCell proxyId={proxyId} proxies={proxies} />
      <span className={styles.region}>{region}</span>
      <span className={savedSites > 0 ? undefined : styles.muted}>
        {savedSites > 0 ? t.sites(savedSites) : t.nothingSaved}
      </span>
      <span className={styles.muted}>{lastOpened}</span>
      <button
        type="button"
        className={styles.open}
        aria-label={t.openName(name)}
        title={openTitle}
        disabled={onOpen === null}
        onClick={onOpen ?? undefined}
      >
        {t.open}
      </button>
    </div>
  )
}

function ProxyCell({
  proxyId,
  proxies,
}: {
  proxyId: number | null
  proxies: Proxy[]
}) {
  const t = useT().profiles
  if (proxyId === null) return <span className={styles.muted}>{t.noProxy}</span>
  const proxy = proxies.find((each) => each.id === proxyId)
  if (!proxy) return <span className={styles.danger}>{t.deletedProxy}</span>
  return (
    <span className={styles.proxy}>
      {proxy.country && <Flag code={proxy.country} />}
      <span className={styles.proxyName}>{proxyTitle(proxy)}</span>
    </span>
  )
}

function regionText(
  regions: Region[],
  choice: RegionChoice,
  proxyCountry: string | null,
  thisComputer: string,
) {
  const region = resolveRegion(regions, choice, proxyCountry)
  return region ? regionName(region) : thisComputer
}

function lastOpened(
  t: ReturnType<typeof useT>['profiles'],
  justNow: string,
  at: number | null,
) {
  if (at === null) return t.never
  const since = ago(at)
  return since === justNow ? since : t.ago(since)
}
