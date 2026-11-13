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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function run(action: () => Promise<string | void>) {
    setBusy(true)
    setError('')
    try {
      const message = await action()
      if (message) setNote(message)
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
        return 'Steam sent an email to confirm the trade.'
      }
    })
  }

  return (
    <span className={styles.actions}>
      {!offer.sent && (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => declineTradeOffer(offer))}
          >
            Decline
          </Button>
          <Button
            size="sm"
            busy={busy}
            disabled={busy}
            // Taking items costs nothing, so only a trade that gives some is asked about.
            onClick={() =>
              offer.give.length > 0 ? setConfirming(true) : void accept()
            }
          >
            Accept
          </Button>
        </>
      )}
      {offer.sent && offer.state === 'needsConfirmation' && (
        <Button
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => void run(() => confirmTradeOffer(offer))}
        >
          Confirm
        </Button>
      )}
      {offer.sent && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => cancelTradeOffer(offer))}
        >
          Cancel
        </Button>
      )}
      {error && (
        <span className={styles.actionError} role="alert">
          {error}
        </span>
      )}
      {note && (
        <span className={styles.actionNote} role="status">
          {note}
        </span>
      )}
      <Dialog
        open={confirming}
        title="Accept the trade?"
        onClose={() => setConfirming(false)}
      >
        {warnings.length > 0 && (
          <p className={styles.scam}>
            The sender looks risky. {warnings.map(warningText).join(' · ')}
          </p>
        )}
        <p className={dialogStyles.text}>
          Guard confirms it right away, and the items leave {offer.accountName}.
        </p>
        <ItemList label="You give" items={offer.give} />
        <ItemList label="You get" items={offer.get} />
        <div className={dialogStyles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void accept()}>
            Accept
          </Button>
        </div>
      </Dialog>
    </span>
  )
}

function ItemList({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className={styles.itemList}>
      <span className={styles.itemListLabel}>{label}</span>
      {items.length === 0 ? (
        <span className={styles.nothing}>Nothing</span>
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
