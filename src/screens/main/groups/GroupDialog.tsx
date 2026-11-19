import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import {
  addToGroup,
  createGroup,
  GROUP_COLORS,
  removeFromGroup,
  removeGroup,
  updateGroup,
  type GroupColor,
} from '../../../api/groups.ts'
import { errorMessage } from '../../../api/vault.ts'
import Avatar from '../../../components/Avatar.tsx'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Icon from '../../../components/Icon.tsx'
import TextField from '../../../components/TextField.tsx'
import { useT } from '../../../i18n/index.ts'
import { matchesQuery } from '../useAccounts.ts'
import tint from './groupColor.module.css'
import styles from './GroupDialog.module.css'

const PLUS = 'M12 5v14M5 12h14'
const CHECK = 'M20 6L9 17l-5-5'
// How long the save button says it saved.
const SAVED_FOR_MS = 2000

/** Where the dialog opens: the first group, or a new group with `preset` ticked. */
export type GroupsView = { view: 'list' } | { view: 'new'; preset?: string[] }

type Props = {
  /** `null` when closed. */
  start: GroupsView | null
  accounts: Account[]
  groups: Group[]
  onClose: () => void
  /** The groups changed; `removed` is the id of one that's gone. */
  onChanged: (removed?: number) => void
}

/** Every group in one place: the list on the left, the picked one's settings on the right. */
export default function GroupDialog({ start, ...rest }: Props) {
  // Mounted only while open, so every opening starts where it was asked to.
  return start === null ? null : <Opened start={start} {...rest} />
}

/** A group's id, or `new` while one is being made. */
type Picked = number | 'new'

function Opened({
  start,
  accounts,
  groups,
  onClose,
  onChanged,
}: Omit<Props, 'start'> & { start: GroupsView }) {
  const t = useT().groups
  const nameField = useRef<HTMLInputElement>(null)
  const first = (): Picked => groups[0]?.id ?? 'new'
  const [picked, setPicked] = useState<Picked>(() =>
    start.view === 'new' ? 'new' : first(),
  )
  const [preset, setPreset] = useState(
    start.view === 'new' ? start.preset : undefined,
  )
  const group = groups.find((known) => known.id === picked) ?? null
  // A deleted group falls back to the first one left.
  const shown: Picked = picked === 'new' || group ? picked : first()

  function pick(next: Picked) {
    setPreset(undefined)
    setPicked(next)
  }

  return (
    <Dialog
      open
      wide
      title={t.title}
      onClose={onClose}
      initialFocus={start.view === 'new' ? nameField : undefined}
    >
      <div className={styles.manager}>
        <nav className={styles.side} aria-label={t.title}>
          <ul className={styles.groups}>
            {groups.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.group}
                  aria-current={shown === item.id}
                  onClick={() => pick(item.id)}
                >
                  <span className={tint.tint} data-color={item.color}>
                    <span className={tint.dot} />
                  </span>
                  <span className={styles.groupName}>{item.name}</span>
                  <span className={styles.groupCount}>{item.count}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={`${styles.group} ${styles.newGroup}`}
                aria-current={shown === 'new'}
                onClick={() => pick('new')}
              >
                <Icon path={PLUS} size={13} stroke={2} />
                <span className={styles.groupName}>{t.newGroup}</span>
              </button>
            </li>
          </ul>
        </nav>
        <div className={styles.pane}>
          <Form
            key={shown}
            accounts={accounts}
            groups={groups}
            group={shown === 'new' ? null : group}
            preset={shown === 'new' ? preset : undefined}
            nameField={nameField}
            onClose={onClose}
            onSaved={(saved, removed) => {
              onChanged(removed)
              setPreset(undefined)
              setPicked(saved ?? 'new')
            }}
          />
        </div>
      </div>
    </Dialog>
  )
}

/** A color no group has yet, so a new group stands out from the rest. */
function freshColor(groups: Group[]): GroupColor {
  const used = new Set(groups.map((group) => group.color))
  return (
    GROUP_COLORS.find((color) => color !== 'gray' && !used.has(color)) ?? 'gray'
  )
}

function Form({
  accounts,
  groups,
  group,
  preset,
  nameField,
  onClose,
  onSaved,
}: {
  accounts: Account[]
  groups: Group[]
  /** Without it, a new one is made. */
  group: Group | null
  preset?: string[]
  nameField: RefObject<HTMLInputElement | null>
  onClose: () => void
  /** `saved` is the group to show next, `removed` one that's gone. */
  onSaved: (saved?: number, removed?: number) => void
}) {
  const words = useT()
  const t = words.groups
  const members = (id: number) =>
    accounts
      .filter((account) => account.groupIds.includes(id))
      .map((account) => account.accountName)
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState<GroupColor>(
    () => group?.color ?? freshColor(groups),
  )
  const [picked, setPicked] = useState(
    () => new Set(group ? members(group.id) : preset),
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const shown = accounts.filter((account) => matchesQuery(account, query))
  const before = group ? members(group.id) : []
  const changed =
    !group ||
    name.trim() !== group.name ||
    color !== group.color ||
    before.length !== picked.size ||
    before.some((account) => !picked.has(account))

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), SAVED_FOR_MS)
    return () => clearTimeout(timer)
  }, [justSaved])

  function pickColor(next: GroupColor) {
    setJustSaved(false)
    setColor(next)
  }

  function toggle(accountName: string) {
    setJustSaved(false)
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(accountName)) next.add(accountName)
      return next
    })
  }

  async function run(
    action: () => Promise<number | undefined>,
    removed?: number,
  ) {
    setBusy(true)
    setError('')
    let saved: number | undefined
    try {
      saved = await action()
    } catch (err) {
      setError(errorMessage(err))
      return
    } finally {
      // Saving keeps the same group open, so the form stays and must be usable.
      setBusy(false)
    }
    if (group && removed === undefined) setJustSaved(true)
    onSaved(saved, removed)
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !name.trim() || !changed) return
    if (!group) {
      void run(() => createGroup(name, color, [...picked]))
      return
    }
    const before = new Set(members(group.id))
    const added = [...picked].filter((account) => !before.has(account))
    const left = [...before].filter((account) => !picked.has(account))
    void run(async () => {
      if (name.trim() !== group.name || color !== group.color) {
        await updateGroup(group.id, name, color)
      }
      if (added.length > 0) await addToGroup(added, group.id)
      if (left.length > 0) await removeFromGroup(left, group.id)
      return group.id
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
            onClick={() =>
              void run(async () => {
                await removeGroup(group.id)
                return groups.find((other) => other.id !== group.id)?.id
              }, group.id)
            }
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
        onChange={(event) => {
          setJustSaved(false)
          setName(event.target.value)
        }}
      />
      <div className={styles.colorRow}>
        <span className={styles.label} id="group-color">
          {t.color}
        </span>
        <div
          className={styles.swatches}
          role="radiogroup"
          aria-labelledby="group-color"
        >
          {GROUP_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={color === option}
              aria-label={t.colors[option]}
              title={t.colors[option]}
              className={`${styles.swatch} ${tint.tint}`}
              data-color={option}
              onClick={() => pickColor(option)}
            >
              {color === option && <Icon path={CHECK} size={12} stroke={3} />}
            </button>
          ))}
        </div>
      </div>
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
            const elsewhere = groups.filter(
              (other) =>
                other.id !== group?.id && account.groupIds.includes(other.id),
            )
            return (
              <button
                key={account.accountName}
                type="button"
                role="checkbox"
                aria-checked={picked.has(account.accountName)}
                className={styles.row}
                onClick={() => toggle(account.accountName)}
              >
                <span className={styles.check} aria-hidden="true">
                  {picked.has(account.accountName) && (
                    <Icon path={CHECK} size={12} stroke={3} />
                  )}
                </span>
                <Avatar
                  name={account.accountName}
                  src={account.avatar}
                  size="xs"
                />
                <span className={styles.who}>
                  <span className={styles.login}>{account.accountName}</span>
                  {account.personaName && (
                    <span className={styles.persona}>
                      {account.personaName}
                    </span>
                  )}
                </span>
                {elsewhere.length > 0 && (
                  <span className={styles.tags}>
                    {elsewhere.map((other) => (
                      <span
                        key={other.id}
                        className={`${styles.tag} ${tint.tint}`}
                        data-color={other.color}
                      >
                        {other.name}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            )
          })}
          {shown.length === 0 && (
            <p className={styles.nothing}>{t.nothingFound}</p>
          )}
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
            {t.close}
          </Button>
          <Button
            type="submit"
            size="sm"
            busy={busy}
            disabled={busy || !name.trim() || !changed}
          >
            {justSaved && !busy && <Icon path={CHECK} size={14} stroke={2.4} />}
            {justSaved && !busy
              ? t.saved
              : group
                ? words.common.save
                : t.createGroup}
          </Button>
        </span>
      </div>
    </form>
  )
}
