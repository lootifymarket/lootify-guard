import { useState, type ReactNode } from 'react'
import type { FreeGame, OwnedGame } from '../../../api/playing.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import styles from './PlayingTab.module.css'

const CHECK = 'M20 6L9 17l-5-5'

type Props = {
  open: boolean
  /** `undefined` while Steam is asked. */
  owned: OwnedGame[] | undefined
  /** Free games the account can play even without them. */
  free: FreeGame[]
  picked: number[]
  /** How many games may be picked. */
  room: number
  onClose: () => void
  onDone: (games: number[]) => void
}

export default function GamePicker(props: Props) {
  const t = useT().account.picker
  return (
    <Dialog open={props.open} title={t.title} onClose={props.onClose}>
      {props.open && <Picker {...props} />}
    </Dialog>
  )
}

function Picker({
  owned,
  free,
  picked: initial,
  room,
  onClose,
  onDone,
}: Props) {
  const words = useT()
  const t = words.account.picker
  const [picked, setPicked] = useState(initial)
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const matches = (game: { appId: number; name: string }) =>
    !needle ||
    game.name.toLowerCase().includes(needle) ||
    String(game.appId) === needle
  const ownedIds = new Set(owned?.map((game) => game.appId))
  const shownOwned = (owned ?? []).filter(matches)
  // Free games the account has already show with its own, hours and all.
  const shownFree = free.filter(
    (game) => !ownedIds.has(game.appId) && matches(game),
  )
  // An app ID typed in, for a game the lists don't show, like one played only
  // through family sharing.
  const typed = /^\d+$/.test(needle) ? Number(needle) : null
  const typedShown =
    typed !== null &&
    !shownOwned.some((game) => game.appId === typed) &&
    !shownFree.some((game) => game.appId === typed)
  const full = picked.length >= room

  function toggle(id: number) {
    setPicked(
      picked.includes(id)
        ? picked.filter((game) => game !== id)
        : full
          ? picked
          : [...picked, id],
    )
  }

  const row = (id: number, name: string, side: ReactNode) => (
    <Row
      key={id}
      name={name}
      checked={picked.includes(id)}
      disabled={full && !picked.includes(id)}
      onToggle={() => toggle(id)}
    >
      {side}
    </Row>
  )

  return (
    <>
      <div className={styles.pickerHead}>
        <span className={styles.label}>{t.picked(picked.length, room)}</span>
        <input
          type="search"
          aria-label={t.find}
          placeholder={t.findPlaceholder}
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className={styles.list}>
        {typedShown && row(typed, t.app(typed), null)}

        <span className={styles.group}>{t.inLibrary}</span>
        {owned === undefined && <p className={styles.listNote}>{t.loading}</p>}
        {owned?.length === 0 && <p className={styles.listNote}>{t.noGames}</p>}
        {shownOwned.map((game) =>
          row(
            game.appId,
            game.name,
            <span className={styles.rowHours}>
              {t.hours(Math.floor(game.minutes / 60))}
            </span>,
          ),
        )}

        {shownFree.length > 0 && (
          <>
            <span className={styles.group}>
              {t.freeToAdd}
              <span className={styles.groupHint}>{t.freeHint}</span>
            </span>
            {shownFree.map((game) =>
              row(
                game.appId,
                game.name,
                <span className={styles.tag}>{t.free}</span>,
              ),
            )}
          </>
        )}
      </div>
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {words.common.cancel}
        </Button>
        <Button size="sm" onClick={() => onDone(picked)}>
          {t.done}
        </Button>
      </div>
    </>
  )
}

function Row({
  name,
  checked,
  disabled,
  onToggle,
  children,
}: {
  name: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={styles.row}
      onClick={onToggle}
    >
      <span className={styles.check} aria-hidden="true">
        {checked && <Icon path={CHECK} size={12} stroke={3} />}
      </span>
      <span className={styles.rowName}>{name}</span>
      {children}
    </button>
  )
}
