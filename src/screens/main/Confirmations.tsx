import { useEffect, useEffectEvent, useState } from 'react'
import type { Account } from '../../api/accounts.ts'
import {
  confirmationKindName,
  listConfirmations,
  respondToConfirmations,
  type Confirmation,
} from '../../api/confirmations.ts'
import { errorMessage } from '../../api/vault.ts'
import { ago } from '../../lib/ago.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import Icon from '../../components/Icon.tsx'
import { useT } from '../../i18n/index.ts'
import { fromAccounts, type AccountFailure } from './fromAccounts.ts'
import styles from './Confirmations.module.css'

type Item = Confirmation & { accountName: string }

const REFRESH =
  'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15'

type Props = {
  accounts: Account[]
  /** Changing it loads the list again, as after auto-confirm took some items. */
  reloadKey: number
  onChanged: () => void
}

/** Pending trade and market confirmations across every signed-in account. */
export default function Confirmations({
  accounts,
  reloadKey,
  onChanged,
}: Props) {
  const words = useT()
  const t = words.guard.confirmations
  const signedIn = accounts
    .filter((account) => account.signedIn)
    .map((account) => account.accountName)
  const signedInKey = signedIn.join('\n')
  const [items, setItems] = useState<Item[] | null>(null)
  const [failures, setFailures] = useState<AccountFailure[]>([])
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [confirmingAll, setConfirmingAll] = useState(false)
  const changed = useEffectEvent(onChanged)

  useEffect(() => {
    let active = true
    const names = signedInKey ? signedInKey.split('\n') : []
    void fromAccounts(names, listConfirmations).then(({ items, failures }) => {
      if (!active) return
      setItems(items.sort((a, b) => b.createdAt - a.createdAt))
      setFailures(failures)
      // A failed account may have lost its session, which the list shows.
      if (failures.length > 0) changed()
    })
    return () => {
      active = false
    }
  }, [signedInKey, revision, reloadKey])

  async function respond(targets: Item[], accept: boolean) {
    const ids = targets.map((item) => item.id)
    setBusy((all) => new Set([...all, ...ids]))
    const byAccount = new Map<string, Item[]>()
    for (const item of targets) {
      byAccount.set(item.accountName, [
        ...(byAccount.get(item.accountName) ?? []),
        item,
      ])
    }
    const done = new Set<string>()
    const errors: Record<string, string> = {}
    await Promise.all(
      [...byAccount].map(async ([accountName, group]) => {
        try {
          await respondToConfirmations(accountName, group, accept)
          group.forEach((item) => done.add(item.id))
        } catch (err) {
          group.forEach((item) => (errors[item.id] = errorMessage(err)))
        }
      }),
    )
    setItems((all) => all?.filter((item) => !done.has(item.id)) ?? null)
    setItemErrors((all) => ({ ...all, ...errors }))
    setBusy((all) => new Set([...all].filter((id) => !ids.includes(id))))
    if (Object.keys(errors).length > 0) onChanged()
  }

  const loading = items === null && signedIn.length > 0

  return (
    <section className={styles.panel} aria-labelledby="confirmations-title">
      <div className={styles.head}>
        <h2 id="confirmations-title" className={styles.title}>
          {t.title}
          {items ? ` · ${items.length}` : ''}
        </h2>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t.refresh}
            title={words.guard.refresh}
            disabled={loading}
            onClick={() => {
              setItems(null)
              setRevision((r) => r + 1)
            }}
          >
            <Icon path={REFRESH} size={14} stroke={2} />
          </button>
          <Button
            size="sm"
            disabled={!items?.length || busy.size > 0}
            onClick={() => setConfirmingAll(true)}
          >
            {t.confirmAll}
          </Button>
        </div>
      </div>

      {signedIn.length === 0 && <p className={styles.note}>{t.signInFirst}</p>}
      {loading && <p className={styles.note}>{words.guard.loading}</p>}
      {items?.length === 0 && failures.length === 0 && (
        <p className={styles.note}>{t.nothing}</p>
      )}

      {failures.map((failure) => (
        <p key={failure.accountName} className={styles.failure} role="alert">
          {failure.accountName}:{' '}
          <span className={styles.reason}>{failure.reason}</span>
        </p>
      ))}

      {items?.map((item) => (
        <div key={item.id} className={styles.item}>
          <div className={styles.itemHead}>
            <span className={styles.itemWords}>
              <span className={styles.headline}>{item.headline}</span>
              {item.summary.length > 0 && (
                <span className={styles.summary}>
                  {item.summary.join(', ')}
                </span>
              )}
            </span>
            <span className={styles.meta}>
              {item.accountName} · {confirmationKindName(item.kind)} ·{' '}
              {ago(item.createdAt)}
            </span>
          </div>
          {itemErrors[item.id] && (
            <span className={`${styles.failure} ${styles.reason}`} role="alert">
              {itemErrors[item.id]}
            </span>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.confirm}
              disabled={busy.has(item.id)}
              onClick={() => void respond([item], true)}
            >
              {t.confirm}
            </button>
            <button
              type="button"
              className={styles.decline}
              disabled={busy.has(item.id)}
              onClick={() => void respond([item], false)}
            >
              {t.decline}
            </button>
          </div>
        </div>
      ))}

      <Dialog
        open={confirmingAll}
        title={t.confirmAllTitle}
        onClose={() => setConfirmingAll(false)}
      >
        <p className={dialogStyles.text}>
          {t.confirmAllText(
            items?.length ?? 0,
            new Set(items?.map((item) => item.accountName)).size,
          )}
        </p>
        <div className={dialogStyles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmingAll(false)}
          >
            {words.common.cancel}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setConfirmingAll(false)
              void respond(items ?? [], true)
            }}
          >
            {t.confirmAll}
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
