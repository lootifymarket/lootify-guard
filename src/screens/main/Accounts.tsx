import { useState } from 'react'
import {
  CODE_PERIOD_SECS,
  describe,
  type Account,
  type AccountList,
  type Group,
} from '../../api/accounts.ts'
import Avatar from '../../components/Avatar.tsx'
import Button from '../../components/Button.tsx'
import { useCopy } from '../../lib/useCopy.ts'
import GroupDialog from './groups/GroupDialog.tsx'
import ImportMaFiles from './ImportMaFiles.tsx'
import { matchesQuery, useCodeSecondsLeft } from './useAccounts.ts'
import layout from './layout.module.css'
import styles from './Accounts.module.css'

/** A group's id, every account, or the ones in no group. */
type Filter = number | 'all' | 'none'

type Props = {
  list: AccountList
  onImported: () => void
  /** Groups changed. */
  onChanged: () => void
  onOpen: (accountName: string) => void
  onAdd: () => void
}

export default function Accounts({
  list,
  onImported,
  onChanged,
  onOpen,
  onAdd,
}: Props) {
  const [query, setQuery] = useState('')
  // Logins are the only identifier every account has; Steam IDs can be missing.
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  // `null` makes a new group; a group edits it.
  const [editing, setEditing] = useState<{ group: Group | null } | null>(null)
  const { accounts, groups } = list

  if (accounts.length === 0) {
    return (
      <>
        <h1 className={layout.title}>Accounts</h1>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>No accounts yet</h2>
          <p className={styles.emptyText}>
            Sign in to add an account and set up Steam Guard here, or import
            .maFile files from Steam Desktop Authenticator, ASF or
            steamguard-cli. Their secrets are stored only in this vault.
          </p>
          <div className={styles.tools}>
            <Button size="sm" onClick={onAdd}>
              Add account
            </Button>
            <ImportMaFiles variant="secondary" onImported={onImported} />
          </div>
        </div>
      </>
    )
  }

  const shown = accounts
    .filter(
      (account) =>
        filter === 'all' ||
        (filter === 'none'
          ? account.groupId === null
          : account.groupId === filter),
    )
    .filter((account) => matchesQuery(account, query))
  // The details follow the filter, so they never show an account the list hides.
  const selected =
    shown.find((account) => account.accountName === selectedName) ??
    shown[0] ??
    accounts[0]
  const grouped = new Map(groups.map((group) => [group.id, group.name]))
  const loose = accounts.filter((account) => account.groupId === null).length
  const current = groups.find((group) => group.id === filter)

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
          <Button size="sm" onClick={onAdd}>
            Add account
          </Button>
        </div>
      </div>
      <div className={styles.chips} role="group" aria-label="Groups">
        <Chip
          label="All"
          count={accounts.length}
          on={filter === 'all'}
          onPick={() => setFilter('all')}
        />
        {groups.map((group) => (
          <Chip
            key={group.id}
            label={group.name}
            count={group.count}
            on={filter === group.id}
            onPick={() => setFilter(group.id)}
          />
        ))}
        {groups.length > 0 && loose > 0 && (
          <Chip
            label="No group"
            count={loose}
            on={filter === 'none'}
            onPick={() => setFilter('none')}
          />
        )}
        <button
          type="button"
          className={styles.newGroup}
          onClick={() => setEditing({ group: null })}
        >
          + New group
        </button>
        {current && (
          <button
            type="button"
            className={styles.editGroup}
            onClick={() => setEditing({ group: current })}
          >
            Edit {current.name}
          </button>
        )}
      </div>
      <GroupDialog
        open={editing !== null}
        accounts={accounts}
        groups={groups}
        group={editing?.group ?? null}
        onClose={() => setEditing(null)}
        onSaved={(removed) => {
          setEditing(null)
          if (removed) setFilter('all')
          onChanged()
        }}
      />
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
                  <span className={styles.login}>
                    {account.accountName}
                    {account.groupId !== null && filter === 'all' && (
                      <span className={styles.groupTag}>
                        {grouped.get(account.groupId)}
                      </span>
                    )}
                  </span>
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

function Chip({
  label,
  count,
  on,
  onPick,
}: {
  label: string
  count: number
  on: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={on}
      onClick={onPick}
    >
      {label}
      <span className={styles.chipCount}>{count}</span>
    </button>
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
