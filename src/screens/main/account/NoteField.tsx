import { useState } from 'react'
import { setAccountNote } from '../../../api/accounts.ts'
import { errorMessage } from '../../../api/vault.ts'
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import styles from './AccountPage.module.css'

type Props = {
  accountName: string
  note: string | null
  onSaved: () => void
}

/** A note for the account list, saved when the field is left. */
export default function NoteField({ accountName, note, onSaved }: Props) {
  const t = useT().account.security
  const toast = useToast()
  const [draft, setDraft] = useState(note ?? '')
  const [error, setError] = useState('')

  async function save() {
    if (draft.trim() === (note ?? '')) return
    setError('')
    try {
      await setAccountNote(accountName, draft)
      toast(t.noteSaved)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <dd className={styles.noteField}>
      <input
        type="text"
        aria-label={t.note}
        placeholder={t.notePlaceholder}
        maxLength={120}
        className={styles.noteInput}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </dd>
  )
}
