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
import { useT } from '../../../i18n/index.ts'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import styles from './AccountPage.module.css'

// Each is named by the field's key in the dictionary.
const PRIVACY_FIELDS: (keyof Privacy)[] = ['profile', 'inventory', 'games']

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
  const words = useT()
  const t = words.account.profile
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
        {status?.text ?? t.loading}
      </p>
    )
  }

  const changes = changesFrom(saved, draft)
  const visibilityOptions = (
    Object.entries(VISIBILITY_NAMES) as [Visibility, string][]
  ).map(([value, label]) => ({ value, label }))
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
      setStatus({ ok: true, text: t.saved })
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
          label={t.nickname}
          value={draft.personaName}
          onChange={(event) => edit({ personaName: event.target.value })}
        />
        <div className={styles.field}>
          <TextField
            label={t.url}
            placeholder={t.notSet}
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
          {t.summary}
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
        {PRIVACY_FIELDS.map((key) => (
          <Dropdown
            key={key}
            label={t.privacy[key]}
            value={draft.privacy[key]}
            options={visibilityOptions}
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
          <span className={styles.fieldLabel}>{t.pastNames}</span>
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
          {t.clearHistory}
        </button>
        <Button type="submit" size="sm" busy={busy} disabled={!dirty || busy}>
          {busy ? t.saving : words.common.save}
        </Button>
      </div>
      <Dialog
        open={clearing}
        title={t.clearTitle}
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
  if (PRIVACY_FIELDS.some((key) => draft.privacy[key] !== saved.privacy[key])) {
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
  const words = useT()
  const t = words.account.profile
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
      <p className={dialogStyles.text}>{t.clearText}</p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {words.common.cancel}
        </Button>
        <Button
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => void clear()}
        >
          {t.clear}
        </Button>
      </div>
    </>
  )
}
