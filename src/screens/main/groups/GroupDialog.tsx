import { useRef, useState, type FormEvent, type RefObject } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import {
  createGroup,
  removeGroup,
  renameGroup,
  setAccountGroup,
} from '../../../api/groups.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import TextField from '../../../components/TextField.tsx'
import { useT } from '../../../i18n/index.ts'
import { matchesQuery } from '../useAccounts.ts'
import styles from './GroupDialog.module.css'

type Props = {
  open: boolean
  accounts: Account[]
  groups: Group[]
  /** The group to edit; without it, a new one is made. */
  group: Group | null
  onClose: () => void
  /** The groups changed; `removed` when the edited one is gone. */
  onSaved: (removed?: boolean) => void
}

export default function GroupDialog(props: Props) {
  const t = useT().groups
  const nameField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={props.open}
      title={props.group ? t.editGroup : t.newGroup}
      onClose={props.onClose}
      initialFocus={nameField}
    >
      <Form {...props} nameField={nameField} />
    </Dialog>
  )
}

function Form({
  accounts,
  groups,
  group,
  onClose,
  onSaved,
  nameField,
}: Props & { nameField: RefObject<HTMLInputElement | null> }) {
  const words = useT()
  const t = words.groups
  const members = (id: number | null) =>
    accounts
      .filter((account) => id !== null && account.groupId === id)
      .map((account) => account.accountName)
  const [name, setName] = useState(group?.name ?? '')
  const [picked, setPicked] = useState(
    () => new Set(members(group?.id ?? null)),
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const groupName = (id: number | null) =>
    groups.find((other) => other.id === id)?.name
  const shown = accounts.filter((account) => matchesQuery(account, query))

  function toggle(accountName: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(accountName)) next.add(accountName)
      return next
    })
  }

  async function run(action: () => Promise<unknown>, removed = false) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onSaved(removed)
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !name.trim()) return
    if (!group) {
      void run(() => createGroup(name, [...picked]))
      return
    }
    const before = new Set(members(group.id))
    const added = [...picked].filter((account) => !before.has(account))
    const left = [...before].filter((account) => !picked.has(account))
    void run(async () => {
      if (name.trim() !== group.name) await renameGroup(group.id, name)
      if (added.length > 0) await setAccountGroup(added, group.id)
      if (left.length > 0) await setAccountGroup(left, null)
    })
  }

  if (deleting && group) {
    return (
      <>
        <p className={dialogStyles.text}>
          {t.deleteText(group.name, group.count)}
        </p>
        {error && (
          <p className={dialogStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={dialogStyles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeleting(false)}
          >
            {words.common.back}
          </Button>
          <Button
            variant="danger"
            size="sm"
            busy={busy}
            disabled={busy}
            onClick={() => void run(() => removeGroup(group.id), true)}
          >
            {t.deleteGroup}
          </Button>
        </div>
      </>
    )
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <TextField
        ref={nameField}
        label={t.name}
        placeholder={t.namePlaceholder}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className={styles.picker}>
        <div className={styles.pickerHead}>
          <span className={styles.label}>{t.accounts(picked.size)}</span>
          <input
            type="search"
            aria-label={t.findAccount}
            placeholder={t.findAccount}
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={styles.list}>
          {shown.map((account) => {
            const elsewhere =
              account.groupId !== null && account.groupId !== group?.id
                ? groupName(account.groupId)
                : undefined
            return (
              <label key={account.accountName} className={styles.row}>
                <input
                  type="checkbox"
                  checked={picked.has(account.accountName)}
                  onChange={() => toggle(account.accountName)}
                />
                <span className={styles.login}>{account.accountName}</span>
                {elsewhere && (
                  <span className={styles.elsewhere}>
                    {picked.has(account.accountName)
                      ? t.movesFrom(elsewhere)
                      : t.inGroup(elsewhere)}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </div>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {group && (
          <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
            {t.delete}
          </Button>
        )}
        <span className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {words.common.cancel}
          </Button>
          <Button
            type="submit"
            size="sm"
            busy={busy}
            disabled={busy || !name.trim()}
          >
            {group ? words.common.save : t.createGroup}
          </Button>
        </span>
      </div>
    </form>
  )
}
