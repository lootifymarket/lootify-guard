import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type FormEvent,
} from 'react'
import {
  clearNameHistory,
  profileSettings,
  saveProfile,
  VISIBILITY_NAMES,
  type Privacy,
  type ProfileChanges,
  type ProfileSettings,
  type Visibility,
} from '../../../api/profile.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import styles from './AccountPage.module.css'

const PRIVACY_FIELDS: { key: keyof Privacy; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'games', label: 'Games' },
]

const VISIBILITY_OPTIONS = (
  Object.entries(VISIBILITY_NAMES) as [Visibility, string][]
).map(([value, label]) => ({ value, label }))

type Props = {
  accountName: string
  steamId: string | null
  /** The nickname changed, or Steam turned the session down. */
  onChanged: () => void
}

/** The profile as others see it in Steam, edited and saved there. */
export default function ProfileForm({
  accountName,
  steamId,
  onChanged,
}: Props) {
  const [saved, setSaved] = useState<ProfileSettings | null>(null)
  const [draft, setDraft] = useState<ProfileSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [clearing, setClearing] = useState(false)
  const summaryId = useId()

  const failed = useEffectEvent((err: unknown) => {
    setStatus({ ok: false, text: errorMessage(err) })
    onChanged()
  })
  useEffect(() => {
    void profileSettings(accountName).then((settings) => {
      setSaved(settings)
      setDraft(settings)
    }, failed)
  }, [accountName])

  if (!draft || !saved) {
    return (
      <p
        className={status ? styles.error : styles.muted}
        role={status ? 'alert' : undefined}
      >
        {status?.text ?? 'Loading the profile…'}
      </p>
    )
  }

  const changes = changesFrom(saved, draft)
  const dirty = Object.keys(changes).length > 0

  function edit(next: Partial<ProfileSettings>) {
    setDraft((current) => current && { ...current, ...next })
    setStatus(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!dirty || busy || !draft) return
    setBusy(true)
    setStatus(null)
    try {
      await saveProfile(accountName, changes)
      // The nickname list isn't edited here, so the saved one is kept.
      setSaved(
        (current) => current && { ...draft, pastNames: current.pastNames },
      )
      setStatus({ ok: true, text: 'Saved in Steam.' })
      if (changes.personaName !== undefined) onChanged()
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    }
    setBusy(false)
  }

  return (
    <form className={styles.section} onSubmit={(event) => void save(event)}>
      <div className={styles.profileGrid}>
        <TextField
          label="Nickname"
          value={draft.personaName}
          onChange={(event) => edit({ personaName: event.target.value })}
        />
        <div className={styles.field}>
          <TextField
            label="Profile URL"
            placeholder="Not set"
            autoCapitalize="off"
            spellCheck={false}
            value={draft.customUrl}
            onChange={(event) => edit({ customUrl: event.target.value.trim() })}
          />
          <span className={styles.fieldHint} data-private>
            {saved.customUrl
              ? `steamcommunity.com/id/${saved.customUrl}`
              : `steamcommunity.com/profiles/${steamId ?? '…'}`}
          </span>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={summaryId} className={styles.fieldLabel}>
          Summary
        </label>
        <textarea
          id={summaryId}
          rows={3}
          className={styles.textarea}
          value={draft.summary}
          onChange={(event) => edit({ summary: event.target.value })}
        />
      </div>
      <div className={styles.privacyGrid}>
        {PRIVACY_FIELDS.map(({ key, label }) => (
          <Dropdown
            key={key}
            label={label}
            value={draft.privacy[key]}
            options={VISIBILITY_OPTIONS}
            onChange={(value) =>
              edit({
                privacy: { ...draft.privacy, [key]: value as Visibility },
              })
            }
          />
        ))}
      </div>
      {saved.pastNames && saved.pastNames.length > 0 && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Past nicknames</span>
          <ul className={styles.pastNames}>
            {saved.pastNames.map((past, i) => (
              <li key={i}>
                {past.name}
                <span className={styles.muted}> · {past.changed}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status && (
        <p
          className={status.ok ? styles.muted : styles.error}
          role={status.ok ? 'status' : 'alert'}
        >
          {status.text}
        </p>
      )}
      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.link}
          onClick={() => setClearing(true)}
        >
          Clear nickname history
        </button>
        <Button type="submit" size="sm" busy={busy} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <Dialog
        open={clearing}
        title="Clear nickname history?"
        onClose={() => setClearing(false)}
      >
        <ClearNames
          accountName={accountName}
          onCancel={() => setClearing(false)}
          onCleared={() => {
            setClearing(false)
            setSaved((current) => current && { ...current, pastNames: [] })
          }}
        />
      </Dialog>
    </form>
  )
}

function changesFrom(saved: ProfileSettings, draft: ProfileSettings) {
  const changes: ProfileChanges = {}
  if (draft.personaName !== saved.personaName) {
    changes.personaName = draft.personaName
  }
  if (draft.customUrl !== saved.customUrl) changes.customUrl = draft.customUrl
  if (draft.summary !== saved.summary) changes.summary = draft.summary
  if (
    PRIVACY_FIELDS.some(({ key }) => draft.privacy[key] !== saved.privacy[key])
  ) {
    changes.privacy = draft.privacy
  }
  return changes
}

function ClearNames({
  accountName,
  onCancel,
  onCleared,
}: {
  accountName: string
  onCancel: () => void
  onCleared: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function clear() {
    setBusy(true)
    setError('')
    try {
      await clearNameHistory(accountName)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onCleared()
  }

  return (
    <>
      <p className={dialogStyles.text}>
        Steam removes the list of past nicknames others see on the profile. This
        can’t be undone.
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => void clear()}
        >
          Clear
        </Button>
      </div>
    </>
  )
}
