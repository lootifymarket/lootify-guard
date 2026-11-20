import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { useT } from '../../../i18n/index.ts'
import styles from './Tasks.module.css'

type Props = {
  accounts: Account[]
  groups: Group[]
  /** Account names. */
  picked: Set<string>
  onChange: (picked: Set<string>) => void
}

/** Accounts to tick one by one, under their groups, with a search over them. */
export default function AccountPicker({
  accounts,
  groups,
  picked,
  onChange,
}: Props) {
  const t = useT().tasks
  const [query, setQuery] = useState('')

  const words = query.trim().toLowerCase()
  const matching = accounts.filter(
    (account) =>
      !words ||
      account.accountName.toLowerCase().includes(words) ||
      (account.personaName ?? '').toLowerCase().includes(words),
  )
  const loose = matching.filter((account) => account.groupIds.length === 0)
  // An account in two groups is under both; ticking it ticks it in both.
  const sections: { name: string | null; accounts: Account[] }[] =
    groups.length === 0
      ? [{ name: null, accounts: matching }]
      : [
          ...groups.map((group) => ({
            name: group.name,
            accounts: matching.filter((account) =>
              account.groupIds.includes(group.id),
            ),
          })),
          { name: t.noGroup, accounts: loose },
        ]
  const shown = sections.filter((section) => section.accounts.length > 0)

  function setAll(names: string[], on: boolean) {
    const next = new Set(picked)
    for (const name of names) {
      if (on) next.add(name)
      else next.delete(name)
    }
    onChange(next)
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerBar}>
        <input
          type="search"
          className={styles.search}
          aria-label={t.search}
          placeholder={t.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className={styles.pickerLink}
          onClick={() => setAll(names(matching), true)}
        >
          {t.pickAll}
        </button>
        <button
          type="button"
          className={styles.pickerLink}
          onClick={() => setAll(names(matching), false)}
        >
          {t.pickNone}
        </button>
      </div>
      <div className={styles.pickerList}>
        {shown.map((section) => {
          const inSection = names(section.accounts)
          const on = inSection.filter((name) => picked.has(name)).length
          return (
            <div key={section.name ?? ''}>
              {section.name !== null && (
                <label className={styles.pickerGroup}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={on === inSection.length}
                    ref={(box) => {
                      if (box)
                        box.indeterminate = on > 0 && on < inSection.length
                    }}
                    onChange={() => setAll(inSection, on < inSection.length)}
                  />
                  <span className={styles.pickerGroupName}>{section.name}</span>
                  <span className={styles.count}>
                    {on} / {inSection.length}
                  </span>
                </label>
              )}
              {section.accounts.map((account) => (
                <label key={account.accountName} className={styles.pickerRow}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={picked.has(account.accountName)}
                    onChange={(event) =>
                      setAll([account.accountName], event.target.checked)
                    }
                  />
                  <span className={styles.pickerName}>
                    {account.personaName || account.accountName}
                  </span>
                  {account.personaName && (
                    <span className={styles.pickerLogin}>
                      {account.accountName}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className={styles.pickerEmpty}>{t.noMatches}</p>
        )}
      </div>
    </div>
  )
}

function names(accounts: Account[]) {
  return accounts.map((account) => account.accountName)
}
