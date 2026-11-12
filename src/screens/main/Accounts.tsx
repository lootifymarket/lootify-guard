import { useState } from 'react'
import {
  CODE_PERIOD_SECS,
  describe,
  type Account,
  type AccountList,
} from '../../api/accounts.ts'
import Avatar from '../../components/Avatar.tsx'
import { useCopy } from '../../lib/useCopy.ts'
import ImportMaFiles from './ImportMaFiles.tsx'
import { matchesQuery, useCodeSecondsLeft } from './useAccounts.ts'
import layout from './layout.module.css'
import styles from './Accounts.module.css'

type Props = {
  list: AccountList
  onImported: () => void
  onOpen: (accountName: string) => void
}

export default function Accounts({ list, onImported, onOpen }: Props) {
  const [query, setQuery] = useState('')
  // Logins are the only identifier every account has; Steam IDs can be missing.
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const { accounts } = list

  if (accounts.length === 0) {
    return (
      <>
        <h1 className={layout.title}>Accounts</h1>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>No accounts yet</h2>
          <p className={styles.emptyText}>
            Import .maFile files from Steam Desktop Authenticator, ASF or
            steamguard-cli. Their secrets are stored only in this vault.
          </p>
          <ImportMaFiles variant="primary" onImported={onImported} />
        </div>
      </>
    )
  }

  const selected =
    accounts.find((account) => account.accountName === selectedName) ??
    accounts[0]
  const shown = accounts.filter((account) => matchesQuery(account, query))

  return (
    <>
      <div className={layout.header}>
        <h1 className={layout.title}>Accounts</h1>
        <div className={styles.tools}>
          <input
            type="search"
            aria-label="Search accounts"
            placeholder="Login or Steam ID"
            className={`${layout.search} ${styles.search}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ImportMaFiles variant="secondary" onImported={onImported} />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.list}>
          {shown.map((account) => (
            <div
              key={account.accountName}
              className={styles.row}
              data-selected={account === selected}
            >
              <button
                type="button"
                className={styles.select}
                aria-pressed={account === selected}
                onClick={() => setSelectedName(account.accountName)}
              >
                <Avatar
                  name={account.accountName}
                  src={account.avatar}
                  size="sm"
                />
                <span className={styles.names}>
                  <span className={styles.login}>{account.accountName}</span>
                  {account.personaName ? (
                    <span className={styles.nickname}>
                      {account.personaName}
                    </span>
                  ) : (
                    account.steamId && (
                      <span className={styles.steamId}>{account.steamId}</span>
                    )
                  )}
                </span>
              </button>
              <button
                type="button"
                className={styles.view}
                aria-label={`View ${account.accountName}`}
                onClick={() => onOpen(account.accountName)}
              >
                View
              </button>
            </div>
          ))}
          {shown.length === 0 && <p className={layout.note}>Nothing found.</p>}
        </div>
        <Details account={selected} codesExpireAt={list.codesExpireAt} />
      </div>
    </>
  )
}

function Details({
  account,
  codesExpireAt,
}: {
  account: Account
  codesExpireAt: number
}) {
  const { copy, label } = useCopy()
  const secondsLeft = useCodeSecondsLeft(codesExpireAt)

  return (
    <aside className={styles.details} aria-label={account.accountName}>
      <div className={styles.identity}>
        <span className={styles.detailsName}>{describe(account).title}</span>
        {describe(account).details && (
          <span className={styles.steamId}>{describe(account).details}</span>
        )}
      </div>
      <div className={styles.guard}>
        <div className={styles.guardHead}>
          <span className={styles.guardLabel}>Steam Guard</span>
          <button
            type="button"
            className={styles.copy}
            onClick={() => copy(account.accountName, account.code)}
          >
            {label(account.accountName, 'Copy')}
          </button>
        </div>
        <span className={styles.code}>{account.code}</span>
        <span className={layout.bar}>
          <span
            className={layout.barFill}
            style={{ width: `${(secondsLeft / CODE_PERIOD_SECS) * 100}%` }}
          />
        </span>
        <span className={styles.refresh}>Refreshes in {secondsLeft} s</span>
      </div>
    </aside>
  )
}
