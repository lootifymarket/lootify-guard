import { useEffect, useEffectEvent, useState } from 'react'
import {
  isOpen,
  listTradeOffers,
  OFFER_STATE_NAMES,
  type Item,
  type TradeOffer,
  type Trades as TradeList,
} from '../../../api/trades.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { ago } from '../../../lib/ago.ts'
import layout from '../layout.module.css'
import styles from './Trades.module.css'

type Tab = 'incoming' | 'outgoing' | 'history'

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'incoming', label: 'Incoming', empty: 'No offers waiting for you.' },
  { id: 'outgoing', label: 'Outgoing', empty: 'No offers waiting on others.' },
  { id: 'history', label: 'History', empty: 'No offers finished this week.' },
]

const tabOf = (offer: TradeOffer): Tab =>
  !isOpen(offer.state) ? 'history' : offer.sent ? 'outgoing' : 'incoming'

type Props = {
  /** Steam turned a session down, so the account list is out of date. */
  onChanged: () => void
}

/** Trade offers of every signed-in account in one list. */
export default function Trades({ onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('incoming')
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

  const shown = trades?.offers.filter((offer) => tabOf(offer) === tab) ?? []
  const count = (id: Tab) =>
    trades?.offers.filter((offer) => tabOf(offer) === id).length ?? 0

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>Trades</h1>
          <span className={styles.subtitle}>
            Trade offers from all your accounts in one list
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          busy={loading}
          disabled={loading}
          onClick={load}
        >
          {loading ? 'Loading…' : 'Reload'}
        </Button>
      </div>

      <div role="tablist" aria-label="Offers" className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {trades && <span className={styles.count}>{count(item.id)}</span>}
          </button>
        ))}
      </div>

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
        {trades && shown.length > 0 && (
          <div className={styles.table}>
            <div className={styles.head} aria-hidden="true">
              <span>From → to</span>
              <span>You give</span>
              <span>You get</span>
            </div>
            {shown.map((offer) => (
              <OfferRow
                key={`${offer.accountName}-${offer.id}`}
                offer={offer}
              />
            ))}
          </div>
        )}
        {trades && shown.length === 0 && (
          <p className={layout.note}>
            {TABS.find((item) => item.id === tab)?.empty}
          </p>
        )}
        {!trades && !error && <p className={layout.note}>Asking Steam…</p>}
        {trades && trades.signedOut.length > 0 && (
          <p className={styles.footnote}>
            Not shown, as they aren’t signed in to Steam:{' '}
            {trades.signedOut.join(', ')}
          </p>
        )}
      </div>
    </>
  )
}

function OfferRow({ offer }: { offer: TradeOffer }) {
  const partner =
    offer.partnerAccount ?? offer.partnerName ?? `Steam ID ${offer.partnerId}`
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
          {offer.partnerAccount && ' · between your accounts'}
        </span>
      </span>
      <Items items={offer.give} />
      <Items items={offer.get} />
      <span className={styles.note}>
        {offer.message && <q className={styles.message}>{offer.message}</q>}
        <span>{status(offer)}</span>
      </span>
    </div>
  )
}

function Items({ items }: { items: Item[] }) {
  if (items.length === 0) return <span className={styles.nothing}>Nothing</span>
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
        <span className={styles.more}>
          and {rest.length} more {rest.length === 1 ? 'item' : 'items'}
        </span>
      )}
    </span>
  )
}

function status(offer: TradeOffer) {
  if (offer.state === 'active') {
    return `${offer.sent ? 'Waiting · ' : ''}expires in ${left(offer.expiresAt)}`
  }
  if (offer.state === 'onHold' && offer.heldUntil) {
    return `Accepted, items arrive in ${left(offer.heldUntil)}`
  }
  return OFFER_STATE_NAMES[offer.state]
}

function left(unixSeconds: number) {
  const hours = Math.max(
    0,
    Math.round((unixSeconds - Date.now() / 1000) / 3600),
  )
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`
}
