import { useState } from 'react'
import { CODE_PERIOD_SECS, type AccountList } from '../../api/accounts.ts'
import { useT } from '../../i18n/index.ts'
import { MASK, useStreamerMode } from '../../lib/streamer.ts'
import { useCopy } from '../../lib/useCopy.ts'
import AutoConfirm from './AutoConfirm.tsx'
import Confirmations from './Confirmations.tsx'
import SignInRequests from './SignInRequests.tsx'
import { matchesQuery, useCodeSecondsLeft } from './useAccounts.ts'
import layout from './layout.module.css'
import styles from './SteamGuard.module.css'
import Private from '../../components/Private.tsx'

type Props = {
  list: AccountList
  /** Something changed an account, such as a session Steam stopped accepting. */
  onChanged: () => void
}

export default function SteamGuard({ list, onChanged }: Props) {
  const t = useT().guard
  const [query, setQuery] = useState('')
  const [confirmationsKey, setConfirmationsKey] = useState(0)
  const { copy, label } = useCopy()
  const streamer = useStreamerMode()
  const idleHint = streamer.on ? t.hiddenClickToCopy : t.clickToCopy
  const secondsLeft = useCodeSecondsLeft(list.codesExpireAt)
  const shown = list.accounts.filter((account) => matchesQuery(account, query))

  return (
    <>
      <div className={layout.header}>
        <h1 className={layout.title}>{t.title}</h1>
        <div className={styles.timer}>
          <span className={`${layout.bar} ${styles.timerBar}`}>
            <span
              className={layout.barFill}
              style={{ width: `${(secondsLeft / CODE_PERIOD_SECS) * 100}%` }}
            />
          </span>
          <span className={styles.seconds}>{t.seconds(secondsLeft)}</span>
        </div>
      </div>
      <div className={styles.columns}>
        <section className={styles.codes} aria-label={t.codes}>
          <input
            type="search"
            aria-label={t.findAccount}
            placeholder={t.findAccount}
            className={`${layout.search} ${styles.search}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {shown.map((account) => (
            <button
              key={account.accountName}
              type="button"
              className={styles.code}
              onClick={() => copy(account.accountName, account.code)}
            >
              <span className={styles.who}>
                <span className={styles.login}>{account.accountName}</span>
                <span
                  className={styles.hint}
                  data-copied={label(account.accountName, '') !== ''}
                >
                  {label(account.accountName, idleHint)}
                </span>
              </span>
              <span className={styles.value}>
                <Private mask={MASK.code}>{account.code}</Private>
              </span>
            </button>
          ))}
          {shown.length === 0 && (
            <p className={layout.note}>
              {list.accounts.length === 0 ? t.noAccounts : t.nothingFound}
            </p>
          )}
        </section>
        <div className={styles.side}>
          <Confirmations
            accounts={list.accounts}
            reloadKey={confirmationsKey}
            onChanged={onChanged}
          />
          <SignInRequests accounts={list.accounts} onChanged={onChanged} />
          <AutoConfirm
            accounts={list.accounts}
            groups={list.groups}
            onChanged={onChanged}
            onConfirmed={() => setConfirmationsKey((key) => key + 1)}
          />
        </div>
      </div>
    </>
  )
}
