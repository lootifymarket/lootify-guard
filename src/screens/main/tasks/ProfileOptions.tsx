import { useRef } from 'react'
import { VISIBILITY_NAMES, type Visibility } from '../../../api/profile.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import styles from './Tasks.module.css'

export type PrivacyKey = 'profile' | 'inventory' | 'games'

export type ProfileChoice = {
  nameTemplate: string
  privacy: Partial<Record<PrivacyKey, Visibility>>
  avatar: File | null
}

const PRIVACY: { key: PrivacyKey; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'games', label: 'Games' },
]

const KEEP = 'keep'

const VISIBILITY_OPTIONS = [
  { value: KEEP, label: 'Keep' },
  ...(['public', 'friendsOnly', 'private'] as const).map((value) => ({
    value,
    label: VISIBILITY_NAMES[value],
  })),
]

type Props = {
  choice: ProfileChoice
  onChange: (choice: ProfileChoice) => void
}

/** What a Profile task changes; anything left empty stays as it is. */
export default function ProfileOptions({ choice, onChange }: Props) {
  const picker = useRef<HTMLInputElement>(null)

  function setPrivacy(key: PrivacyKey, value: string) {
    const privacy = { ...choice.privacy }
    if (value === KEEP) delete privacy[key]
    else privacy[key] = value as Visibility
    onChange({ ...choice, privacy })
  }

  return (
    <div className={styles.options}>
      <div className={styles.optionGroup}>
        <TextField
          label="Nickname"
          placeholder="Keep as is"
          className={styles.nameInput}
          maxLength={40}
          value={choice.nameTemplate}
          onChange={(event) =>
            onChange({ ...choice, nameTemplate: event.target.value })
          }
        />
        <p className={styles.note}>
          {'{n}'} becomes the account’s place in the group: farm {'{n}'} gives
          farm 1, farm 2…
        </p>
      </div>

      <div className={styles.privacy}>
        {PRIVACY.map(({ key, label }) => (
          <Dropdown
            key={key}
            label={label}
            size="sm"
            value={choice.privacy[key] ?? KEEP}
            options={VISIBILITY_OPTIONS}
            onChange={(value) => setPrivacy(key, value)}
          />
        ))}
      </div>

      <div className={styles.option}>
        <span className={styles.avatarName}>
          {choice.avatar ? choice.avatar.name : 'Avatar: keep'}
        </span>
        <span className={styles.avatarActions}>
          {choice.avatar && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ ...choice, avatar: null })}
            >
              Remove
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => picker.current?.click()}
          >
            {choice.avatar ? 'Change' : 'Choose image'}
          </Button>
        </span>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onChange({ ...choice, avatar: file })
          }}
        />
      </div>
    </div>
  )
}
