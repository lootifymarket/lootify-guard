import { useState } from 'react'
import type { Account, Group } from '../../api/accounts.ts'
import {
  AUTO_CONFIRM_RULES,
  setAutoConfirmRule,
  type AutoConfirmRule,
} from '../../api/autoConfirm.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import Dropdown from '../../components/Dropdown.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import { groupOptions, inGroup } from './groups/groupFilter.ts'
import styles from './AutoConfirmRules.module.css'

const TICK = 'M20 6L9 17l-5-5'
const DASH = 'M6 12h12'

type Props = {
  open: boolean
  accounts: Account[]
  groups: Group[]
  onClose: () => void
  onChanged: () => void
}

/** Every account against every rule, to set them for many accounts at once. */
export default function AutoConfirmRules({
  open,
  accounts,
  groups,
  onClose,
  onChanged,
}: Props) {
  const [groupFilter, setGroupFilter] = useState('')
  const shown = accounts.filter((account) =>
    inGroup(account.groupId, groupFilter),
  )
  return (
    <Dialog open={open} title="Auto-confirm rules" wide onClose={onClose}>
      {groups.length > 0 && (
        <div className={styles.groupFilter}>
          <Dropdown
            label="Group"
            hideLabel
            size="sm"
            value={groupFilter}
            options={groupOptions(groups)}
            onChange={setGroupFilter}
          />
        </div>
      )}
      <Table accounts={shown} onChanged={onChanged} />
      <div className={styles.footer}>
        <span className={styles.never}>
          API keys, phone changes and account recovery are never confirmed
          automatically.
        </span>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  )
}

function Table({
  accounts,
  onChanged,
}: {
  accounts: Account[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function set(names: string[], rule: AutoConfirmRule, on: boolean) {
    setBusy(true)
    setError('')
    try {
      await setAutoConfirmRule(names, rule, on)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
    onChanged()
  }

  if (accounts.length === 0) {
    return (
      <p className={dialogStyles.text}>
        No accounts yet. Import .maFile files on the Accounts screen.
      </p>
    )
  }

  const names = accounts.map((account) => account.accountName)
  const risky = accounts
    .filter((account) => account.autoConfirm.anyMarketListing)
    .map((account) => account.accountName)

  return (
    <>
      <p className={dialogStyles.text}>
        Changes apply right away. Each account’s page has the same switches.
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.accountHead}>
                Account
              </th>
              {AUTO_CONFIRM_RULES.map(({ rule, short, warning }) => (
                <th
                  key={rule}
                  scope="col"
                  className={warning ? styles.riskyHead : styles.ruleHead}
                >
                  {short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className={styles.allRow}>
              <th scope="row" className={styles.allLabel}>
                All {accounts.length}
              </th>
              {AUTO_CONFIRM_RULES.map(({ rule, label }) => {
                const on = accounts.filter(
                  (account) => account.autoConfirm[rule],
                ).length
                const all = on === accounts.length
                return (
                  <td key={rule} className={styles.cell}>
                    <Check
                      checked={all ? true : on > 0 ? 'mixed' : false}
                      label={`${label} for every account`}
                      disabled={busy}
                      onClick={() => void set(names, rule, !all)}
                    />
                  </td>
                )
              })}
            </tr>
            {accounts.map((account) => (
              <tr key={account.accountName} className={styles.row}>
                <th scope="row" className={styles.account}>
                  <span className={styles.login}>{account.accountName}</span>
                  {!account.signedIn && (
                    <span className={styles.notSignedIn}>Not signed in</span>
                  )}
                </th>
                {AUTO_CONFIRM_RULES.map(({ rule, label }) => (
                  <td key={rule} className={styles.cell}>
                    <Check
                      checked={account.autoConfirm[rule]}
                      label={`${account.accountName}: ${label}`}
                      disabled={busy}
                      onClick={() =>
                        void set(
                          [account.accountName],
                          rule,
                          !account.autoConfirm[rule],
                        )
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {risky.length > 0 && (
        <p className={styles.warning}>
          Any market listing is on for {risky.join(', ')}. Listings made by
          anyone who gets into{' '}
          {risky.length === 1 ? 'that Steam session' : 'those Steam sessions'}{' '}
          are confirmed too.
        </p>
      )}
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <dl className={styles.legend}>
        {AUTO_CONFIRM_RULES.map(({ rule, label, hint }) => (
          <div key={rule} className={styles.term}>
            <dt>{label}</dt>
            <dd>{hint}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Check({
  checked,
  label,
  disabled,
  onClick,
}: {
  checked: boolean | 'mixed'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={styles.check}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.box}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path d={checked === 'mixed' ? DASH : TICK} />
          </svg>
        )}
      </span>
    </button>
  )
}
