import { useEffect, useEffectEvent, useState } from 'react'
import {
  CODE_PERIOD_SECS,
  describe,
  type Account,
  type AccountList,
  type Group,
} from '../../api/accounts.ts'
import { listConfirmations } from '../../api/confirmations.ts'
import { formatMoney, walletBalance } from '../../api/profile.ts'
import { listProxies, proxyTitle, type Proxy } from '../../api/proxies.ts'
import Avatar from '../../components/Avatar.tsx'
import Button from '../../components/Button.tsx'
import Icon from '../../components/Icon.tsx'
import Skeleton from '../../components/Skeleton.tsx'
import { fromBackend } from '../../i18n/backend/index.ts'
import { useT } from '../../i18n/index.ts'
import { MASK, useStreamerMode } from '../../lib/streamer.ts'
import { useCopy } from '../../lib/useCopy.ts'
import { fromAccounts } from './fromAccounts.ts'
import GroupDialog from './groups/GroupDialog.tsx'
import ImportMaFiles from './ImportMaFiles.tsx'
import { matchesQuery, useCodeSecondsLeft } from './useAccounts.ts'
import layout from './layout.module.css'
import styles from './Accounts.module.css'
import Private from '../../components/Private.tsx'
import SteamIdLine from './SteamIdLine.tsx'

/** Every account, the playing ones, those needing a look, or a group's. */
type Filter = 'all' | 'playing' | 'issues' | 'none' | number

// A balance read this recently is shown as it is; an older one is asked for again.
const WALLET_FRESH_FOR_SECS = 30 * 60
const SKELETON_ROWS = 6

const EYE =
  'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
const EYE_OFF =
  'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2'

type Props = {
  /** `null` while the vault is read. */
  list: AccountList | null
  onImported: () => void
  /** Groups, notes or balances changed. */
  onChanged: () => void
  onOpen: (accountName: string) => void
  onAdd: () => void
  onGuard: () => void
}

/** Something wrong with the account: no session, or what the last check found. */
function needsLook(account: Account) {
  return !account.signedIn || (account.lastCheck?.problems.length ?? 0) > 0
}

export default function Accounts({
  list,
  onImported,
  onChanged,
  onOpen,
  onAdd,
  onGuard,
}: Props) {
  const t = useT().accounts
  const streamer = useStreamerMode()
  const [query, setQuery] = useState('')
  // Logins are the only identifier every account has; Steam IDs can be missing.
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  // `null` makes a new group; a group edits it.
  const [editing, setEditing] = useState<{ group: Group | null } | null>(null)
  const [waiting, setWaiting] = useState<number | null>(null)
  // Balances asked of Steam since the screen opened, so a total can be shown.
  const [walletsRead, setWalletsRead] = useState(false)
  const [proxies, setProxies] = useState<Proxy[]>([])

  useEffect(() => {
    void listProxies().then(setProxies)
  }, [])

  const signedIn = list?.accounts.filter((account) => account.signedIn) ?? []
  const signedInKey = signedIn.map((account) => account.accountName).join()

  const countWaiting = useEffectEvent(() => {
    void fromAccounts(
      signedIn.map((account) => account.accountName),
      listConfirmations,
    ).then(({ items }) => setWaiting(items.length))
  })
  useEffect(() => {
    if (signedInKey) countWaiting()
  }, [signedInKey])

  // Balances are kept with each account; the ones gone stale are read again quietly.
  const refreshWallets = useEffectEvent(() => {
    const now = Date.now() / 1000
    const stale = signedIn
      .filter(
        (account) =>
          !account.wallet || now - account.wallet.at > WALLET_FRESH_FOR_SECS,
      )
      .map((account) => account.accountName)
    if (stale.length === 0) return
    void fromAccounts(stale, (name) => walletBalance(name).then(() => [])).then(
      () => {
        setWalletsRead(true)
        onChanged()
      },
    )
  })
  useEffect(() => {
    if (signedInKey) refreshWallets()
  }, [signedInKey])

  const header = (
    <div className={layout.header}>
      <h1 className={layout.title}>{t.title}</h1>
      <div className={styles.tools}>
        <input
          type="search"
          aria-label={t.search}
          placeholder={t.searchPlaceholder}
          className={`${layout.search} ${styles.search}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className={styles.streamer}
          aria-pressed={streamer.on}
          title={t.streamerHint}
          onClick={() => void streamer.set(!streamer.on)}
        >
          <Icon path={streamer.on ? EYE_OFF : EYE} size={15} stroke={1.8} />
          {t.streamer}
        </button>
        <ImportMaFiles variant="secondary" onImported={onImported} />
        <Button size="sm" onClick={onAdd}>
          {t.add}
        </Button>
      </div>
    </div>
  )

  if (list === null) {
    return (
      <>
        {header}
        <Loading />
      </>
    )
  }

  const { accounts, groups } = list
  if (accounts.length === 0) {
    return (
      <>
        <h1 className={layout.title}>{t.title}</h1>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t.emptyTitle}</h2>
          <p className={styles.emptyText}>{t.emptyText}</p>
          <div className={styles.tools}>
            <Button size="sm" onClick={onAdd}>
              {t.add}
            </Button>
            <ImportMaFiles variant="secondary" onImported={onImported} />
          </div>
        </div>
      </>
    )
  }

  const grouped = new Map(groups.map((group) => [group.id, group.name]))
  const proxyNames = new Map(
    proxies.map((proxy) => [proxy.id, proxyTitle(proxy)]),
  )
  const loose = accounts.filter((account) => account.groupId === null).length
  const current = groups.find((group) => group.id === filter)
  const issues = accounts.filter(needsLook)
  const playing = accounts.filter((account) => account.playing)

  const shown = accounts
    .filter((account) => {
      if (filter === 'all') return true
      if (filter === 'playing') return account.playing
      if (filter === 'issues') return needsLook(account)
      if (filter === 'none') return account.groupId === null
      return account.groupId === filter
    })
    .filter(
      (account) =>
        matchesQuery(account, query) ||
        (account.groupId !== null &&
          (grouped.get(account.groupId) ?? '')
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    )
  // The details follow the filter, so they never show an account the list hides.
  const selected =
    shown.find((account) => account.accountName === selectedName) ??
    shown[0] ??
    accounts[0]

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: t.allCount(accounts.length) },
    { id: 'playing', label: t.playingTab },
    { id: 'issues', label: t.issuesTab },
    ...groups.map((group) => ({ id: group.id, label: group.name })),
    ...(groups.length > 0 && loose > 0
      ? [{ id: 'none' as const, label: t.noGroup }]
      : []),
  ]

  return (
    <>
      {header}

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.balance}</span>
          {!walletsRead &&
          signedIn.length > 0 &&
          !accounts.some((account) => account.wallet) ? (
            <Skeleton width={140} height={28} />
          ) : (
            <Balance accounts={accounts} />
          )}
        </div>
        <button
          type="button"
          className={styles.stat}
          onClick={() => setFilter('playing')}
        >
          <span className={styles.statLabel}>{t.playingNow} →</span>
          <span className={`${styles.statValue} rise`}>{playing.length}</span>
        </button>
        <button type="button" className={styles.stat} onClick={onGuard}>
          <span className={styles.statLabel}>{t.awaiting} →</span>
          {waiting === null ? (
            <Skeleton width={48} height={28} />
          ) : (
            <span className={`${styles.statValue} rise`}>{waiting}</span>
          )}
        </button>
        <button
          type="button"
          className={styles.stat}
          onClick={() => {
            setFilter('issues')
            setQuery('')
          }}
        >
          <span className={styles.statLabel}>{t.needAttention} →</span>
          <span
            className={`${styles.statValue} rise`}
            data-tone={issues.length > 0 ? 'danger' : undefined}
          >
            {issues.length}
          </span>
        </button>
      </div>

      <GroupDialog
        open={editing !== null}
        accounts={accounts}
        groups={groups}
        group={editing?.group ?? null}
        onClose={() => setEditing(null)}
        onSaved={(removed) => {
          setEditing(null)
          if (removed) setFilter('all')
          onChanged()
        }}
      />

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.tabsRow}>
            <div className={styles.tabs} role="tablist" aria-label={t.filter}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  className={styles.tab}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className={styles.groupLinks}>
              {current && (
                <button
                  type="button"
                  className={styles.groupLink}
                  onClick={() => setEditing({ group: current })}
                >
                  {t.editGroup(current.name)}
                </button>
              )}
              <button
                type="button"
                className={styles.groupLink}
                onClick={() => setEditing({ group: null })}
              >
                {t.newGroup}
              </button>
            </span>
          </div>

          <div className={styles.scroll}>
            <div className={styles.table} role="table" aria-label={t.title}>
              <div className={styles.head} role="row">
                <span role="columnheader">{t.columns.account}</span>
                <span role="columnheader">{t.columns.group}</span>
                <span role="columnheader">{t.columns.status}</span>
                <span role="columnheader" className={styles.right}>
                  {t.columns.wallet}
                </span>
                <span role="columnheader">{t.columns.notes}</span>
                <span />
              </div>
              <div className="rise">
                {shown.map((account) => (
                  <Row
                    key={account.accountName}
                    account={account}
                    group={
                      account.groupId === null
                        ? null
                        : (grouped.get(account.groupId) ?? null)
                    }
                    selected={account === selected}
                    onSelect={() => setSelectedName(account.accountName)}
                    onOpen={() => onOpen(account.accountName)}
                  />
                ))}
                {shown.length === 0 && (
                  <p className={styles.nothing}>{t.nothingFound}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <Details
          key={selected.accountName}
          account={selected}
          group={
            selected.groupId === null
              ? null
              : (grouped.get(selected.groupId) ?? null)
          }
          proxy={
            selected.proxyId === null
              ? null
              : (proxyNames.get(selected.proxyId) ?? null)
          }
          codesExpireAt={list.codesExpireAt}
          onOpen={() => onOpen(selected.accountName)}
        />
      </div>
    </>
  )
}

/**
 * Wallets come in several currencies, so it's one sum per currency: the one
 * most accounts use is shown large, the rest under it.
 */
function Balance({ accounts }: { accounts: Account[] }) {
  const sums = new Map<string | null, { cents: number; accounts: number }>()
  for (const account of accounts) {
    if (!account.wallet) continue
    const { currency, balance } = account.wallet
    const sum = sums.get(currency) ?? { cents: 0, accounts: 0 }
    sums.set(currency, {
      cents: sum.cents + balance,
      accounts: sum.accounts + 1,
    })
  }
  const [main, ...rest] = [...sums]
    .sort((a, b) => b[1].accounts - a[1].accounts)
    .map(([currency, sum]) => formatMoney(sum.cents, currency))
  return (
    <span className={`${styles.balance} rise`}>
      <span className={styles.statValue}>
        <Private mask={MASK.money}>{main ?? '—'}</Private>
      </span>
      {rest.length > 0 && (
        <span className={styles.otherCurrencies}>
          <Private mask="">{rest.join(' · ')}</Private>
        </span>
      )}
    </span>
  )
}

function Status({ account }: { account: Account }) {
  const t = useT().accounts
  const [tone, text] = account.playing
    ? (['on', t.status.playing] as const)
    : account.signedIn
      ? (['off', t.status.signedIn] as const)
      : (['error', t.status.signedOut] as const)
  return (
    <span className={styles.status} data-tone={tone}>
      <span className={styles.dot} />
      <span className={styles.ellipsis}>{text}</span>
    </span>
  )
}

/** The user's note, or else what the last check found wrong. */
function note(account: Account) {
  if (account.note) return { text: account.note, bad: false }
  const problems = account.lastCheck?.problems ?? []
  if (problems.length === 0) return null
  return { text: fromBackend(problems.join(', ')), bad: true }
}

function Row({
  account,
  group,
  selected,
  onSelect,
  onOpen,
}: {
  account: Account
  group: string | null
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  const t = useT().accounts
  const shownNote = note(account)
  return (
    <div className={styles.row} role="row" data-selected={selected}>
      <button
        type="button"
        className={styles.pick}
        aria-label={t.select(account.accountName)}
        aria-pressed={selected}
        onClick={onSelect}
      />
      <span role="cell" className={styles.who}>
        <Avatar name={account.accountName} src={account.avatar} size="sm" />
        <span className={styles.names}>
          <span className={styles.login}>{account.accountName}</span>
          {account.personaName && (
            <span className={styles.nickname}>{account.personaName}</span>
          )}
        </span>
      </span>
      <span role="cell" className={`${styles.muted} ${styles.ellipsis}`}>
        {group ?? '—'}
      </span>
      <span role="cell">
        <Status account={account} />
      </span>
      <span role="cell" className={styles.money}>
        {account.wallet ? (
          <Private mask={MASK.money}>
            {formatMoney(account.wallet.balance, account.wallet.currency)}
          </Private>
        ) : (
          '—'
        )}
      </span>
      <span
        role="cell"
        className={`${styles.note} ${styles.ellipsis}`}
        data-tone={shownNote?.bad ? 'danger' : undefined}
        title={shownNote?.text}
      >
        {shownNote?.text}
      </span>
      <span role="cell" className={styles.viewCell}>
        <button
          type="button"
          className={styles.view}
          aria-label={t.viewAccount(account.accountName)}
          onClick={onOpen}
        >
          {t.view}
        </button>
      </span>
    </div>
  )
}

function Details({
  account,
  group,
  proxy,
  codesExpireAt,
  onOpen,
}: {
  account: Account
  group: string | null
  proxy: string | null
  codesExpireAt: number
  onOpen: () => void
}) {
  const words = useT()
  const t = words.accounts
  const { copy, label } = useCopy()
  const secondsLeft = useCodeSecondsLeft(codesExpireAt)
  const { wallet } = account

  return (
    <aside
      className={`${styles.details} rise`}
      aria-label={account.accountName}
    >
      <div className={styles.identity}>
        <span className={styles.detailsName}>{describe(account).title}</span>
        {describe(account).details && (
          <span className={styles.steamId}>
            <SteamIdLine account={account} />
          </span>
        )}
      </div>
      <div className={styles.guard}>
        <div className={styles.guardHead}>
          <span className={styles.guardLabel}>{words.guard.title}</span>
          <button
            type="button"
            className={styles.copy}
            onClick={() => copy(account.accountName, account.code)}
          >
            {label(account.accountName, t.copy)}
          </button>
        </div>
        <span className={styles.code}>
          <Private mask={MASK.code}>{account.code}</Private>
        </span>
        <span className={layout.bar}>
          <span
            className={layout.barFill}
            style={{ width: `${(secondsLeft / CODE_PERIOD_SECS) * 100}%` }}
          />
        </span>
        <span className={styles.refresh}>{t.refreshesIn(secondsLeft)}</span>
      </div>
      <span className={styles.rule} />
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t.columns.wallet}</dt>
          <dd className={styles.money}>
            {wallet ? (
              <Private mask={MASK.money}>
                {formatMoney(wallet.balance, wallet.currency)}
              </Private>
            ) : (
              '—'
            )}
            {wallet && wallet.pending > 0 && (
              <span className={styles.pending}>
                <Private mask="">
                  {t.pending(formatMoney(wallet.pending, wallet.currency))}
                </Private>
              </span>
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t.columns.status}</dt>
          <dd>
            <Status account={account} />
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t.proxy}</dt>
          <dd className={styles.ellipsis}>{proxy ?? t.noProxy}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t.columns.group}</dt>
          <dd className={styles.ellipsis}>{group ?? t.noGroup}</dd>
        </div>
      </dl>
      <Button variant="secondary" onClick={onOpen}>
        {t.manage}
      </Button>
    </aside>
  )
}

/** The screen's shape while the vault is read. */
function Loading() {
  return (
    <>
      <div className={styles.summary}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.stat}>
            <Skeleton width={110} height={12} />
            <Skeleton width={140} height={28} />
          </div>
        ))}
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <Skeleton width={260} height={14} />
          <div>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div key={i} className={styles.row}>
                <span className={styles.who}>
                  <Skeleton width={32} height={32} radius="50%" />
                  <span className={styles.names}>
                    <Skeleton width={110} height={12} />
                    <Skeleton width={70} height={10} />
                  </span>
                </span>
                <Skeleton width={80} height={12} />
                <Skeleton width={70} height={12} />
                <Skeleton width={64} height={12} className={styles.right} />
                <Skeleton width={56} height={12} />
                <Skeleton width={52} height={28} />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.details}>
          <Skeleton width={160} height={18} />
          <Skeleton width={110} height={12} />
          <Skeleton height={48} />
          <Skeleton height={90} />
          <Skeleton height={40} />
        </div>
      </div>
    </>
  )
}
