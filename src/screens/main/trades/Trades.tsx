import { useEffect, useEffectEvent, useState } from 'react'
import {
  isOpen,
  listTradeOffers,
  offerStateName,
  warningText,
  type Item,
  type Known,
  type TradeOffer,
  type Trades as TradeList,
} from '../../../api/trades.ts'
import type { Account } from '../../../api/accounts.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import { ago } from '../../../lib/ago.ts'
import { useToast } from '../../../lib/toast.ts'
import layout from '../layout.module.css'
import NewTrade from './NewTrade.tsx'
import OfferActions from './OfferActions.tsx'
import PartnerDialog from './PartnerCheck.tsx'
import { usePartnerCheck } from './usePartnerCheck.ts'
import styles from './Trades.module.css'

type Tab = 'incoming' | 'outgoing' | 'history'

const TABS: Tab[] = ['incoming', 'outgoing', 'history']

const SKELETON_ROWS = 4

const tabOf = (offer: TradeOffer): Tab =>
  !isOpen(offer.state) ? 'history' : offer.sent ? 'outgoing' : 'incoming'

type Props = {
  accounts: Account[]
  /** Steam turned a session down, so the account list is out of date. */
  onChanged: () => void
}

/** Trade offers of every signed-in account in one list. */
export default function Trades({ accounts, onChanged }: Props) {
  const t = useT().trades
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('incoming')
  // A login, or empty for every account.
  const [accountFilter, setAccountFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [trades, setTrades] = useState<TradeList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function loaded(next: TradeList) {
    setTrades(next)
    setLoading(false)
    if (next.failures.length > 0) onChanged()
  }

  function failed(err: unknown) {
    setError(errorMessage(err))
    setLoading(false)
  }

  function load() {
    setLoading(true)
    setError('')
    void listTradeOffers().then(loaded, failed)
  }

  const loadedOnOpen = useEffectEvent(loaded)
  const failedOnOpen = useEffectEvent(failed)
  useEffect(() => {
    void listTradeOffers().then(loadedOnOpen, failedOnOpen)
  }, [])

  const offers =
    trades?.offers.filter(
      (offer) => !accountFilter || offer.accountName === accountFilter,
    ) ?? []
  const shown = offers.filter((offer) => tabOf(offer) === tab)
  const known = knownPeople(accounts, trades?.offers ?? [])
  const count = (id: Tab) =>
    offers.filter((offer) => tabOf(offer) === id).length

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          <span className={styles.subtitle}>{t.subtitle}</span>
        </div>
        <div className={styles.tools}>
          <div className={styles.account}>
            <Dropdown
              label={t.account}
              hideLabel
              size="sm"
              value={accountFilter}
              options={[
                { value: '', label: t.allAccounts },
                ...accounts
                  .filter((account) => account.signedIn)
                  .map((account) => ({
                    value: account.accountName,
                    label: account.personaName || account.accountName,
                    hint: account.personaName ? account.accountName : undefined,
                  })),
              ]}
              onChange={setAccountFilter}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            busy={loading}
            disabled={loading}
            onClick={load}
          >
            {loading ? t.loading : t.reload}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            {t.newTrade}
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label={t.offersLabel} className={styles.tabs}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={styles.tab}
            onClick={() => setTab(id)}
          >
            {t.tabs[id]}
            {trades && <span className={styles.count}>{count(id)}</span>}
          </button>
        ))}
      </div>

      <NewTrade
        open={creating}
        accounts={accounts}
        onClose={() => setCreating(false)}
        onSent={(note) => {
          setCreating(false)
          toast(note)
          setTab('outgoing')
          load()
        }}
      />

      <div role="tabpanel" className={styles.panel}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {trades?.failures.map((failure) => (
          <p key={failure.accountName} className={styles.error} role="alert">
            {failure.accountName}:{' '}
            <span className={styles.reason}>{failure.reason}</span>
          </p>
        ))}
        <div className={styles.scroll}>
          <div className={styles.table}>
            <div className={styles.head} aria-hidden="true">
              <span>{t.columns.parties}</span>
              <span>{t.columns.give}</span>
              <span>{t.columns.get}</span>
              <span>{t.columns.check}</span>
              <span />
            </div>
            {loading ? (
              <Loading />
            ) : (
              trades && (
                <div className="rise">
                  {shown.map((offer) => (
                    <OfferRow
                      key={`${offer.accountName}-${offer.id}`}
                      offer={offer}
                      known={known}
                      pastTrades={pastTrades(trades.offers, offer.partnerId)}
                      onDone={load}
                    />
                  ))}
                  {shown.length === 0 && (
                    <p className={styles.empty}>{t.empty[tab]}</p>
                  )}
                </div>
              )
            )}
          </div>
        </div>
        {trades && trades.signedOut.length > 0 && (
          <p className={styles.footnote}>
            {t.notShown(trades.signedOut.join(', '))}
          </p>
        )}
      </div>
    </>
  )
}

/** The table's shape while Steam is asked. */
function Loading() {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => (
    <div key={i} className={`${styles.row} ${styles.skeletonRow}`}>
      <span className={styles.who}>
        <Skeleton width={140} height={13} />
        <Skeleton width={60} height={10} />
      </span>
      <Skeleton width={130} height={13} />
      <Skeleton width={120} height={13} />
      <Skeleton width={150} height={12} />
      <span className={styles.actions}>
        <Skeleton width={90} height={32} />
        <Skeleton width={90} height={32} />
      </span>
    </div>
  ))
}

function OfferRow({
  offer,
  known,
  pastTrades,
  onDone,
}: {
  offer: TradeOffer
  known: Known[]
  pastTrades: number
  onDone: () => void
}) {
  const t = useT().trades
  const result = usePartnerCheck(offer, known)
  const [checking, setChecking] = useState(false)
  const warnings = result && 'check' in result ? result.check.warnings : []
  const partner =
    offer.partnerAccount ??
    offer.partnerName ??
    t.partnerSteamId(offer.partnerId)
  const [from, to] = offer.sent
    ? [offer.accountName, partner]
    : [partner, offer.accountName]
  return (
    <div className={styles.row}>
      <span className={styles.who}>
        <span className={styles.parties}>
          {from} → {to}
        </span>
        <span className={styles.meta}>
          {ago(offer.createdAt)}
          {offer.partnerAccount && t.betweenYourAccounts}
        </span>
      </span>
      <Items items={offer.give} />
      <Items items={offer.get} />
      <span className={styles.note}>
        {warnings.length > 0 && (
          <span className={styles.risk}>
            {warnings.map(warningText).join(' · ')}
          </span>
        )}
        {offer.message && <q className={styles.message}>{offer.message}</q>}
        <span>{status(t, offer)}</span>
        {result && (
          <button
            type="button"
            className={styles.check}
            onClick={() => setChecking(true)}
          >
            {t.checkSender}
          </button>
        )}
        <PartnerDialog
          open={checking}
          offer={offer}
          result={result}
          pastTrades={pastTrades}
          onClose={() => setChecking(false)}
        />
      </span>
      {isOpen(offer.state) ? (
        <OfferActions offer={offer} warnings={warnings} onDone={onDone} />
      ) : (
        <span />
      )}
    </div>
  )
}

/** People a scammer may copy: the user's own accounts and partners named in the list. */
function knownPeople(accounts: Account[], offers: TradeOffer[]): Known[] {
  const known: Known[] = []
  for (const account of accounts) {
    if (!account.steamId) continue
    known.push({ id: account.steamId, name: account.accountName })
    if (account.personaName) {
      known.push({ id: account.steamId, name: account.personaName })
    }
  }
  for (const offer of offers) {
    if (offer.partnerName) {
      known.push({ id: offer.partnerId, name: offer.partnerName })
    }
  }
  return known
}

/** Trades with this partner that went through, among the ones listed. */
function pastTrades(offers: TradeOffer[], partnerId: string) {
  return offers.filter(
    (offer) =>
      offer.partnerId === partnerId &&
      (offer.state === 'accepted' || offer.state === 'onHold'),
  ).length
}

function Items({ items }: { items: Item[] }) {
  const t = useT().trades
  if (items.length === 0) {
    return <span className={styles.nothing}>{t.nothing}</span>
  }
  const [first, ...rest] = items
  return (
    <span
      className={styles.items}
      title={items
        .map((item) =>
          item.amount > 1 ? `${item.name} × ${item.amount}` : item.name,
        )
        .join('\n')}
    >
      <span
        className={styles.item}
        style={first.color ? { color: `#${first.color}` } : undefined}
      >
        {first.name}
        {first.amount > 1 && ` × ${first.amount}`}
      </span>
      {rest.length > 0 && (
        <span className={styles.more}>{t.moreItems(rest.length)}</span>
      )}
    </span>
  )
}

function status(t: Dictionary['trades'], offer: TradeOffer) {
  if (offer.state === 'active') {
    return t.expiresIn(left(t, offer.expiresAt), offer.sent)
  }
  if (offer.state === 'onHold' && offer.heldUntil) {
    return t.arriveIn(left(t, offer.heldUntil))
  }
  return offerStateName(offer.state)
}

function left(t: Dictionary['trades'], unixSeconds: number) {
  const hours = Math.max(
    0,
    Math.round((unixSeconds - Date.now() / 1000) / 3600),
  )
  return hours < 48 ? t.hours(hours) : t.days(Math.round(hours / 24))
}
