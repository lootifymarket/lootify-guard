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
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
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
  const t = useT().inventory.move
  return (
    <Dialog open={props.open} title={t.title} onClose={props.onClose}>
      <Form {...props} />
    </Dialog>
  )
}

function Form({ accounts, picked, onClose, onMoved }: Props) {
  const words = useT()
  const t = words.inventory.move
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
  const toast = useToast()

  const moving = holders.filter(([account]) => account !== target)
  const count = moving.reduce((sum, [, items]) => sum + items.length, 0)
  const staying = picked[target]?.length ?? 0

  async function move() {
    setBusy(true)
    setError('')
    try {
      const done = await moveItems(
        target,
        moving.map(([accountName, items]) => ({ accountName, items })),
      )
      onMoved()
      // Only what didn't go through is worth a closer look.
      if (done.every((report) => report.outcome === 'done')) {
        toast(t.movedTo(count, target))
        onClose()
      } else {
        setReports(done)
      }
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
                {report.accountName} → {target}:{' '}
                {words.inventory.items(report.count)}
              </span>
              <span className={styles.reportOutcome}>
                {report.outcome === 'done'
                  ? t.moved
                  : report.outcome === 'sent'
                    ? t.sentWaiting(target, report.reason)
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

  return (
    <>
      <Dropdown
        label={t.moveTo}
        value={target}
        options={signedIn.map((account) => ({
          value: account.accountName,
          label: account.personaName || account.accountName,
          hint: [
            account.personaName ? account.accountName : null,
            picked[account.accountName]
              ? t.pickedHere(picked[account.accountName].length)
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
        onChange={setTarget}
      />
      <p className={dialogStyles.text}>
        {count === 0
          ? t.allThere(target)
          : t.plan(count, moving.length, target)}
        {staying > 0 && t.staying(staying)}
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {words.common.cancel}
        </Button>
        <Button
          size="sm"
          busy={busy}
          disabled={busy || count === 0}
          onClick={() => void move()}
        >
          {busy ? t.moving : t.move(count)}
        </Button>
      </div>
    </>
  )
}
