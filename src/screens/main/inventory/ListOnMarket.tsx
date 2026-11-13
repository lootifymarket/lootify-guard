import { useEffect, useEffectEvent, useState } from 'react'
import {
  listOnMarket,
  marketPrices,
  sellerGets,
  type Game,
  type InventoryItem,
  type ListingReport,
  type Prices,
} from '../../../api/inventory.ts'
import { formatMoney } from '../../../api/profile.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useT } from '../../../i18n/index.ts'
import styles from './Inventory.module.css'

type Props = {
  open: boolean
  game: Game
  /** Picked items, by the account they're on. */
  picked: Record<string, InventoryItem[]>
  onClose: () => void
  /** Items listed, so the inventories are out of date. */
  onListed: () => void
}

export default function ListOnMarket(props: Props) {
  const t = useT().inventory.market
  return (
    <Dialog open={props.open} title={t.title} wide onClose={props.onClose}>
      <Form {...props} />
    </Dialog>
  )
}

/** Items of one name, which share a price. */
type Row = { name: string; owned: { account: string; item: InventoryItem }[] }

function Form({ game, picked, onClose, onListed }: Props) {
  const words = useT()
  const t = words.inventory.market
  const rows = rowsOf(picked)
  const skipped = Object.values(picked)
    .flat()
    .filter((item) => !item.marketable).length
  // Prices are asked of the account holding the most, in its wallet currency.
  const asker = Object.entries(picked).sort(
    ([, a], [, b]) => b.length - a.length,
  )[0]?.[0]
  const [prices, setPrices] = useState<Prices | null>(null)
  const [priceError, setPriceError] = useState('')
  const [entered, setEntered] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reports, setReports] = useState<ListingReport[] | null>(null)
  // Kept from before listing, as the inventory reloads without the listed items.
  const [names, setNames] = useState<Record<string, string>>({})
  const namesKey = rows.map((row) => row.name).join('\n')

  const priced = useEffectEvent((found: Prices) => {
    setPrices(found)
    // Each row starts at the lowest price on the market, if there is one.
    setEntered((current) => {
      const next = { ...current }
      for (const [name, price] of Object.entries(found.prices)) {
        if (next[name] === undefined && price.lowest) {
          next[name] = (price.lowest / 100).toFixed(2)
        }
      }
      return next
    })
  })
  const unpriced = useEffectEvent((err: unknown) =>
    setPriceError(errorMessage(err)),
  )
  useEffect(() => {
    if (!asker || !namesKey) return
    void marketPrices(asker, game, namesKey.split('\n')).then(priced, unpriced)
  }, [asker, game, namesKey])

  const currency = prices?.currency ?? null
  const priceOf = (name: string) => cents(entered[name] ?? '')
  const ready = rows.filter((row) => priceOf(row.name) !== null)
  const count = ready.reduce((sum, row) => sum + row.owned.length, 0)
  const total = ready.reduce(
    (sum, row) =>
      sum +
      sellerGets(priceOf(row.name) ?? 0) *
        row.owned.reduce((n, { item }) => n + item.amount, 0),
    0,
  )

  async function list() {
    if (!currency) return
    setBusy(true)
    setError('')
    const groups: Record<string, { item: InventoryItem; price: number }[]> = {}
    const listed: Record<string, string> = {}
    for (const row of ready) {
      const price = priceOf(row.name) ?? 0
      for (const { account, item } of row.owned) {
        ;(groups[account] ??= []).push({ item, price })
        listed[`${account}/${item.assetId}`] = item.name
      }
    }
    setNames(listed)
    try {
      setReports(
        await listOnMarket(
          currency,
          Object.entries(groups).map(([accountName, listings]) => ({
            accountName,
            listings,
          })),
        ),
      )
      onListed()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  if (reports) {
    return <Reports reports={reports} names={names} onClose={onClose} />
  }

  return (
    <>
      <p className={dialogStyles.text}>
        {t.intro}
        {skipped > 0 && t.skipped(skipped)}
      </p>
      {priceError && (
        <p className={dialogStyles.error} role="alert">
          {t.noPrices(priceError)}
        </p>
      )}
      <div className={styles.listings}>
        {rows.map((row) => {
          const price = prices?.prices[row.name]
          const own = priceOf(row.name)
          const amount = row.owned.reduce((n, { item }) => n + item.amount, 0)
          return (
            <div key={row.name} className={styles.listing}>
              <span className={styles.listingWords}>
                <span className={styles.listingName}>
                  {row.name}
                  {amount > 1 && (
                    <span className={styles.muted}> × {amount}</span>
                  )}
                </span>
                <span className={styles.muted} data-private>
                  {!prices && !priceError
                    ? t.asking
                    : price
                      ? [
                          price.lowest !== null &&
                            t.lowest(formatMoney(price.lowest, currency)),
                          price.median !== null &&
                            t.median(formatMoney(price.median, currency)),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t.noPrice}
                </span>
              </span>
              <label className={styles.priceField}>
                <span className={styles.hidden}>{t.buyerPays(row.name)}</span>
                <input
                  data-private
                  inputMode="decimal"
                  placeholder="0.00"
                  value={entered[row.name] ?? ''}
                  onChange={(event) =>
                    setEntered((current) => ({
                      ...current,
                      [row.name]: event.target.value,
                    }))
                  }
                />
              </label>
              <span className={styles.youGet} data-private>
                {own !== null
                  ? t.youGet(formatMoney(sellerGets(own), currency))
                  : ''}
              </span>
            </div>
          )
        })}
      </div>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.listingFooter}>
        <span className={styles.muted} data-private>
          {count > 0 && t.youGetTotal(formatMoney(total, currency))}
        </span>
        <span className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {words.common.cancel}
          </Button>
          <Button
            size="sm"
            busy={busy}
            disabled={busy || count === 0 || !currency}
            onClick={() => void list()}
          >
            {busy ? t.listing : t.list(count)}
          </Button>
        </span>
      </div>
    </>
  )
}

function Reports({
  reports,
  names,
  onClose,
}: {
  reports: ListingReport[]
  /** Item names by account and asset id. */
  names: Record<string, string>
  onClose: () => void
}) {
  const t = useT().inventory.market
  const nameOf = (report: ListingReport) =>
    names[`${report.accountName}/${report.assetId}`] ?? report.assetId
  return (
    <>
      <ul className={styles.reports}>
        {reports.map((report) => (
          <li
            key={`${report.accountName}/${report.assetId}`}
            data-outcome={
              report.outcome === 'done' || report.outcome === 'failed'
                ? report.outcome
                : 'waiting'
            }
          >
            <span>
              {nameOf(report)} · {report.accountName}
            </span>
            <span className={styles.reportOutcome}>
              {report.outcome === 'done'
                ? t.listed
                : report.outcome === 'unconfirmed'
                  ? t.unconfirmed
                  : report.outcome === 'needsEmail'
                    ? t.needsEmail
                    : report.reason}
            </span>
          </li>
        ))}
      </ul>
      <div className={dialogStyles.actions}>
        <Button size="sm" onClick={onClose}>
          {t.done}
        </Button>
      </div>
    </>
  )
}

function rowsOf(picked: Record<string, InventoryItem[]>): Row[] {
  const rows = new Map<string, Row>()
  for (const [account, items] of Object.entries(picked)) {
    for (const item of items) {
      if (!item.marketable) continue
      const row = rows.get(item.name) ?? { name: item.name, owned: [] }
      row.owned.push({ account, item })
      rows.set(item.name, row)
    }
  }
  return [...rows.values()]
}

/** A typed price in hundredths, or `null` when it isn't one. */
function cents(text: string) {
  const value = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}
