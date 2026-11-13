import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import type { Account } from '../../../api/accounts.ts'
import {
  GAME_NAMES,
  inventoryItems,
  type Game,
  type InventoryItem,
} from '../../../api/inventory.ts'
import { sendTradeOffer } from '../../../api/trades.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import ItemCard from '../items/ItemCard.tsx'
import styles from './Trades.module.css'

const GAME_OPTIONS = (Object.entries(GAME_NAMES) as [Game, string][]).map(
  ([value, label]) => ({ value, label }),
)

type Props = {
  open: boolean
  accounts: Account[]
  onClose: () => void
  /** The offer went out; the note says how it was confirmed. */
  onSent: (note: string) => void
}

export default function NewTrade({ open, accounts, onClose, onSent }: Props) {
  return (
    <Dialog open={open} title="New trade" wide onClose={onClose}>
      <Form accounts={accounts} onCancel={onClose} onSent={onSent} />
    </Dialog>
  )
}

function Form({
  accounts,
  onCancel,
  onSent,
}: {
  accounts: Account[]
  onCancel: () => void
  onSent: (note: string) => void
}) {
  const signedIn = accounts.filter((account) => account.signedIn)
  const [from, setFrom] = useState(signedIn[0]?.accountName ?? '')
  const [game, setGame] = useState<Game>('cs2')
  const [tradeUrl, setTradeUrl] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loaded = useEffectEvent((items: InventoryItem[]) => setInventory(items))
  const failed = useEffectEvent((err: unknown) =>
    setLoadError(errorMessage(err)),
  )
  useEffect(() => {
    if (!from) return
    // An answer for an account or game no longer picked is dropped.
    let current = true
    void inventoryItems(from, game).then(
      (items) => current && loaded(items),
      (err: unknown) => current && failed(err),
    )
    return () => {
      current = false
    }
  }, [from, game, attempt])

  function choose(next: { from?: string; game?: Game }) {
    if (next.from !== undefined) setFrom(next.from)
    if (next.game !== undefined) setGame(next.game)
    setInventory(null)
    setLoadError('')
    setPicked(new Set())
  }

  function toggle(assetId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(assetId)) next.add(assetId)
      return next
    })
  }

  const items = inventory?.filter((item) => item.tradable) ?? []
  const held = (inventory?.length ?? 0) - items.length
  const shown = items.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const chosen = items.filter((item) => picked.has(item.assetId))

  async function send(event: FormEvent) {
    event.preventDefault()
    if (busy || chosen.length === 0 || !tradeUrl.trim()) return
    setBusy(true)
    setError('')
    try {
      const sent = await sendTradeOffer(from, tradeUrl, chosen, message)
      onSent(
        sent.accepted === 'needsEmail'
          ? 'Offer sent. Steam emailed a link to confirm it.'
          : 'Offer sent and confirmed.',
      )
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (signedIn.length === 0) {
    return (
      <>
        <p className={dialogStyles.text}>
          No account is signed in to Steam. Sign one in on its page first.
        </p>
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
      </>
    )
  }

  return (
    <form className={styles.newTrade} onSubmit={(event) => void send(event)}>
      <div className={styles.newTradeGrid}>
        <Dropdown
          label="From account"
          value={from}
          options={signedIn.map((account) => ({
            value: account.accountName,
            label: account.personaName || account.accountName,
            hint: account.personaName ? account.accountName : undefined,
          }))}
          onChange={(value) => choose({ from: value })}
        />
        <Dropdown
          label="Game"
          value={game}
          options={GAME_OPTIONS}
          onChange={(value) => choose({ game: value as Game })}
        />
      </div>
      <TextField
        label="Recipient’s trade URL"
        placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
        autoCapitalize="off"
        spellCheck={false}
        value={tradeUrl}
        onChange={(event) => setTradeUrl(event.target.value)}
      />
      <div className={styles.picker}>
        <div className={styles.pickerHead}>
          <span className={styles.pickerTools}>
            <span className={styles.itemListLabel}>
              Items · {chosen.length} selected
            </span>
            {shown.length > 0 && (
              <button
                type="button"
                className={styles.check}
                onClick={() =>
                  setPicked(
                    (current) =>
                      new Set([
                        ...current,
                        ...shown.map((item) => item.assetId),
                      ]),
                  )
                }
              >
                Select all
              </button>
            )}
            {chosen.length > 0 && (
              <button
                type="button"
                className={styles.check}
                onClick={() => setPicked(new Set())}
              >
                Clear selection
              </button>
            )}
          </span>
          <input
            type="search"
            aria-label="Find item"
            placeholder="Find item"
            className={styles.pickerSearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={styles.pickerList}>
          {loadError && (
            <div className={styles.pickerNote}>
              <p className={styles.error} role="alert">
                {loadError}
              </p>
              <button
                type="button"
                className={styles.check}
                onClick={() => {
                  setLoadError('')
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </button>
            </div>
          )}
          {!inventory && !loadError && (
            <p className={styles.pickerNote}>Loading the inventory…</p>
          )}
          {inventory && shown.length === 0 && (
            <p className={styles.pickerNote}>
              {items.length === 0
                ? 'Nothing here can be traded now.'
                : 'No item matches.'}
            </p>
          )}
          {shown.length > 0 && (
            <div className={styles.cards}>
              {shown.map((item) => (
                <ItemCard
                  key={item.assetId}
                  accountName={from}
                  item={item}
                  picked={picked.has(item.assetId)}
                  onToggle={() => toggle(item.assetId)}
                />
              ))}
            </div>
          )}
        </div>
        {held > 0 && (
          <span className={styles.pickerNote}>
            {held} more {held === 1 ? 'item' : 'items'} can’t be traded now.
          </span>
        )}
      </div>
      <TextField
        label="Message"
        placeholder="Optional"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <p className={dialogStyles.text}>
        Nothing is asked back. Guard confirms the offer as soon as it’s sent.
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          busy={busy}
          disabled={busy || chosen.length === 0 || !tradeUrl.trim()}
        >
          {busy
            ? 'Sending…'
            : `Send ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`}
        </Button>
      </div>
    </form>
  )
}
