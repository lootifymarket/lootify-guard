import { useState } from 'react'
import type { OwnedGame } from '../../../api/playing.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import styles from './PlayingTab.module.css'

type Props = {
  open: boolean
  /** `undefined` while Steam is asked. */
  owned: OwnedGame[] | undefined
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

function Picker({ owned, picked: initial, room, onClose, onDone }: Props) {
  const words = useT()
  const t = words.account.picker
  const [picked, setPicked] = useState(initial)
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const shown = (owned ?? []).filter(
    (game) =>
      !needle ||
      game.name.toLowerCase().includes(needle) ||
      String(game.appId) === needle,
  )
  // An app ID typed in, for a game the list doesn't show, like one played only
  // through family sharing.
  const typed = /^\d+$/.test(needle) ? Number(needle) : null
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
        {owned === undefined && <p className={styles.listNote}>{t.loading}</p>}
        {owned?.length === 0 && <p className={styles.listNote}>{t.noGames}</p>}
        {typed !== null && !shown.some((game) => game.appId === typed) && (
          <label className={styles.row}>
            <input
              type="checkbox"
              checked={picked.includes(typed)}
              disabled={full && !picked.includes(typed)}
              onChange={() => toggle(typed)}
            />
            <span className={styles.rowName}>{t.app(typed)}</span>
          </label>
        )}
        {shown.map((game) => (
          <label key={game.appId} className={styles.row}>
            <input
              type="checkbox"
              checked={picked.includes(game.appId)}
              disabled={full && !picked.includes(game.appId)}
              onChange={() => toggle(game.appId)}
            />
            <span className={styles.rowName}>{game.name}</span>
            <span className={styles.rowHours}>
              {t.hours(Math.floor(game.minutes / 60))}
            </span>
          </label>
        ))}
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
