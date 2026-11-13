import { useState } from 'react'
import type { Account } from '../../../api/accounts.ts'
import {
  moveItems,
  type InventoryItem,
  type MoveReport,
} from '../../../api/inventory.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import styles from './Inventory.module.css'

type Props = {
  open: boolean
  accounts: Account[]
  /** Picked items, by the account they're on. */
  picked: Record<string, InventoryItem[]>
  onClose: () => void
  /** Items moved, so the inventories are out of date. */
  onMoved: () => void
}

export default function MoveItems(props: Props) {
  return (
    <Dialog
      open={props.open}
      title="Move to one account"
      onClose={props.onClose}
    >
      <Form {...props} />
    </Dialog>
  )
}

function Form({ accounts, picked, onClose, onMoved }: Props) {
  const signedIn = accounts.filter((account) => account.signedIn)
  const holders = Object.entries(picked).sort(
    ([, a], [, b]) => b.length - a.length,
  )
  // Where most of the picked items already are, so the fewest have to move.
  const [target, setTarget] = useState(
    holders[0]?.[0] ?? signedIn[0]?.accountName ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reports, setReports] = useState<MoveReport[] | null>(null)

  const moving = holders.filter(([account]) => account !== target)
  const count = moving.reduce((sum, [, items]) => sum + items.length, 0)
  const staying = picked[target]?.length ?? 0

  async function move() {
    setBusy(true)
    setError('')
    try {
      setReports(
        await moveItems(
          target,
          moving.map(([accountName, items]) => ({ accountName, items })),
        ),
      )
      onMoved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  if (reports) {
    return (
      <>
        <ul className={styles.reports}>
          {reports.map((report) => (
            <li key={report.accountName} data-outcome={report.outcome}>
              <span>
                {report.accountName} → {target}: {report.count}{' '}
                {report.count === 1 ? 'item' : 'items'}
              </span>
              <span className={styles.reportOutcome}>
                {report.outcome === 'done'
                  ? 'Moved'
                  : report.outcome === 'sent'
                    ? `Sent, but ${target} couldn’t take it yet. It waits on the Trades screen. (${report.reason})`
                    : report.reason}
              </span>
            </li>
          ))}
        </ul>
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <Dropdown
        label="Move to"
        value={target}
        options={signedIn.map((account) => ({
          value: account.accountName,
          label: account.personaName || account.accountName,
          hint: [
            account.personaName ? account.accountName : null,
            picked[account.accountName]
              ? `${picked[account.accountName].length} picked items here`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
        onChange={setTarget}
      />
      <p className={dialogStyles.text}>
        {count === 0
          ? `Everything picked is already on ${target}.`
          : `${count} ${count === 1 ? 'item' : 'items'} from ${moving.length} ${
              moving.length === 1 ? 'account' : 'accounts'
            } ${count === 1 ? 'goes' : 'go'} to ${target}. Each account sends a trade, Guard confirms it, and ${target} accepts it, so no phone is needed.`}
        {staying > 0 &&
          ` ${staying} picked ${staying === 1 ? 'item is' : 'items are'} already there and stay.`}
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          busy={busy}
          disabled={busy || count === 0}
          onClick={() => void move()}
        >
          {busy ? 'Moving…' : `Move ${count} ${count === 1 ? 'item' : 'items'}`}
        </Button>
      </div>
    </>
  )
}
