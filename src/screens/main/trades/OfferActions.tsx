import { useState } from 'react'
import {
  acceptTradeOffer,
  cancelTradeOffer,
  confirmTradeOffer,
  declineTradeOffer,
  warningText,
  type Item,
  type PartnerWarning,
  type TradeOffer,
} from '../../../api/trades.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import styles from './Trades.module.css'

type Props = {
  offer: TradeOffer
  /** What the sender check found, shown again before items leave. */
  warnings: PartnerWarning[]
  /** The offer changed in Steam, so the list should be asked for again. */
  onDone: () => void
}

/** What can be done with an open offer, by which side sent it. */
export default function OfferActions({ offer, warnings, onDone }: Props) {
  const t = useT().trades
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  /** Runs the action and says how it went; the action may word it itself. */
  async function run(action: () => Promise<string | void>, done: string) {
    setBusy(true)
    setError('')
    try {
      toast((await action()) || done)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function accept() {
    setConfirming(false)
    await run(async () => {
      const accepted = await acceptTradeOffer(offer)
      if (accepted === 'needsEmail') {
        return t.actions.emailSent
      }
    }, t.actions.accepted)
  }

  return (
    <span className={styles.actions}>
      {!offer.sent && (
        <>
          <Button
            variant="secondary"
            size="sm"
            className={styles.compact}
            disabled={busy}
            onClick={() =>
              void run(() => declineTradeOffer(offer), t.actions.declined)
            }
          >
            {t.actions.decline}
          </Button>
          <Button
            size="sm"
            className={`${styles.compact} ${styles.light}`}
            busy={busy}
            disabled={busy}
            // Taking items costs nothing, so only a trade that gives some is asked about.
            onClick={() =>
              offer.give.length > 0 ? setConfirming(true) : void accept()
            }
          >
            {t.actions.accept}
          </Button>
        </>
      )}
      {offer.sent && offer.state === 'needsConfirmation' && (
        <Button
          size="sm"
          className={`${styles.compact} ${styles.light}`}
          busy={busy}
          disabled={busy}
          onClick={() =>
            void run(() => confirmTradeOffer(offer), t.actions.confirmed)
          }
        >
          {t.actions.confirm}
        </Button>
      )}
      {offer.sent && (
        <Button
          variant="secondary"
          size="sm"
          className={styles.compact}
          disabled={busy}
          onClick={() =>
            void run(() => cancelTradeOffer(offer), t.actions.canceled)
          }
        >
          {t.actions.cancelOffer}
        </Button>
      )}
      {error && (
        <span className={styles.actionError} role="alert">
          {error}
        </span>
      )}
      <Dialog
        open={confirming}
        title={t.actions.confirmTitle}
        onClose={() => setConfirming(false)}
      >
        {warnings.length > 0 && (
          <p className={styles.scam}>
            {t.actions.risky(warnings.map(warningText).join(' · '))}
          </p>
        )}
        <p className={dialogStyles.text}>
          {t.actions.itemsLeave(offer.accountName)}
        </p>
        <ItemList label={t.columns.give} items={offer.give} />
        <ItemList label={t.columns.get} items={offer.get} />
        <div className={dialogStyles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            {t.actions.cancel}
          </Button>
          <Button size="sm" onClick={() => void accept()}>
            {t.actions.accept}
          </Button>
        </div>
      </Dialog>
    </span>
  )
}

function ItemList({ label, items }: { label: string; items: Item[] }) {
  const t = useT().trades
  return (
    <div className={styles.itemList}>
      <span className={styles.itemListLabel}>{label}</span>
      {items.length === 0 ? (
        <span className={styles.nothing}>{t.nothing}</span>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li
              key={i}
              style={item.color ? { color: `#${item.color}` } : undefined}
            >
              {item.name}
              {item.amount > 1 && ` × ${item.amount}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
