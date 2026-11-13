import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Account, Group } from '../../api/accounts.ts'
import {
  autoConfirmLog,
  setAutoConfirmPaused,
  type AutoConfirmLog,
} from '../../api/autoConfirm.ts'
import { confirmationKindName } from '../../api/confirmations.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import { useT } from '../../i18n/index.ts'
import { ago } from '../../lib/ago.ts'
import AutoConfirmRules from './AutoConfirmRules.tsx'
import styles from './AutoConfirm.module.css'

// The backend checks once a minute, so this only keeps the page from lagging far behind.
const POLL_MS = 10_000

type State = 'running' | 'paused' | 'off'

type Props = {
  accounts: Account[]
  groups: Group[]
  /** Something changed an account, such as a session Steam stopped accepting. */
  onChanged: () => void
  /** Auto-confirm took some confirmations, so the pending list is out of date. */
  onConfirmed: () => void
}

/** What auto-confirm does in the background, with its pause switch and rules. */
export default function AutoConfirm({
  accounts,
  groups,
  onChanged,
  onConfirmed,
}: Props) {
  const t = useT().guard.autoConfirm
  const [log, setLog] = useState<AutoConfirmLog | null>(null)
  const [revision, setRevision] = useState(0)
  const [pausing, setPausing] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [error, setError] = useState('')
  const newest = useRef<string | null>(null)
  const failures = useRef<string | null>(null)
  const changed = useEffectEvent(onChanged)
  const confirmed = useEffectEvent(onConfirmed)

  useEffect(() => {
    let active = true
    async function load() {
      let next: AutoConfirmLog
      try {
        next = await autoConfirmLog()
      } catch (err) {
        if (active) setError(errorMessage(err))
        return
      }
      if (!active) return
      setLog(next)
      setError('')
      // Nothing is reported on the first load: it only sets what later ones compare against.
      const first = next.accepted[0]
      const newestKey = first
        ? `${first.accountName}\n${first.confirmation.id}`
        : ''
      if (newest.current !== null && newest.current !== newestKey) confirmed()
      newest.current = newestKey
      const failureKey = next.failures
        .map((failure) => `${failure.accountName}\n${failure.reason}`)
        .join('\n')
      if (failures.current !== null && failures.current !== failureKey) {
        changed()
      }
      failures.current = failureKey
    }
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [revision])

  async function togglePause() {
    if (!log) return
    setPausing(true)
    setError('')
    try {
      await setAutoConfirmPaused(!log.paused)
    } catch (err) {
      setError(errorMessage(err))
    }
    setPausing(false)
    setRevision((r) => r + 1)
  }

  const on = accounts.filter(
    (account) =>
      account.autoConfirm.tradesToOwnAccounts ||
      account.autoConfirm.anyMarketListing,
  )
  const state: State = log?.paused
    ? 'paused'
    : on.length > 0
      ? 'running'
      : 'off'

  return (
    <section className={styles.panel} aria-labelledby="auto-confirm-title">
      <div className={styles.head}>
        <span className={styles.heading}>
          <h2 id="auto-confirm-title" className={styles.title}>
            {t.title}
          </h2>
          {log && (
            <span className={styles.state} data-state={state}>
              <span className={styles.dot} aria-hidden="true" />
              {t.states[state]}
            </span>
          )}
        </span>
        <div className={styles.tools}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!log || pausing}
            onClick={() => void togglePause()}
          >
            {log?.paused ? t.resume : t.pause}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRulesOpen(true)}
          >
            {t.rules}
          </Button>
        </div>
      </div>

      <p className={styles.summary}>
        {on.length > 0
          ? t.onFor(
              on.length,
              accounts.length,
              on.map((account) => account.accountName).join(', '),
            )
          : t.offForAll}
      </p>
      {log?.paused && <p className={styles.paused}>{t.pausedNote}</p>}
      {error && (
        <p className={styles.failure} role="alert">
          <span className={styles.reason}>{error}</span>
        </p>
      )}
      {log?.failures.map((failure) => (
        <p key={failure.accountName} className={styles.failure} role="alert">
          {failure.accountName}:{' '}
          <span className={styles.reason}>{failure.reason}</span>
        </p>
      ))}

      {log && log.accepted.length > 0 && (
        <ul className={styles.log} aria-label={t.confirmedLog}>
          {log.accepted.map((entry) => (
            <li
              key={`${entry.accountName}\n${entry.confirmation.id}`}
              className={styles.entry}
            >
              <span className={styles.words}>
                <span className={styles.what}>
                  {entry.confirmation.headline}
                </span>
                <span className={styles.meta}>
                  {entry.accountName} ·{' '}
                  {confirmationKindName(entry.confirmation.kind)}
                  {entry.confirmation.summary.length > 0 &&
                    ` · ${entry.confirmation.summary.join(', ')}`}
                </span>
              </span>
              <span className={styles.ago}>{ago(entry.acceptedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {log?.accepted.length === 0 && state === 'running' && (
        <p className={styles.note}>{t.nothingYet}</p>
      )}
      <p className={styles.footnote}>{t.footnote}</p>

      <AutoConfirmRules
        open={rulesOpen}
        accounts={accounts}
        groups={groups}
        onClose={() => setRulesOpen(false)}
        onChanged={onChanged}
      />
    </section>
  )
}
