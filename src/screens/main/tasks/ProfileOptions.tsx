import { useRef } from 'react'
import { VISIBILITY_NAMES, type Visibility } from '../../../api/profile.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import { useT } from '../../../i18n/index.ts'
import styles from './Tasks.module.css'

export type PrivacyKey = 'profile' | 'inventory' | 'games'

export type ProfileChoice = {
  nameTemplate: string
  privacy: Partial<Record<PrivacyKey, Visibility>>
  avatar: File | null
}

const PRIVACY: PrivacyKey[] = ['profile', 'inventory', 'games']

const KEEP = 'keep'

const VISIBILITIES = ['public', 'friendsOnly', 'private'] as const

type Props = {
  choice: ProfileChoice
  onChange: (choice: ProfileChoice) => void
}

/** What a Profile task changes; anything left empty stays as it is. */
export default function ProfileOptions({ choice, onChange }: Props) {
  const words = useT()
  const t = words.tasks.profile
  const picker = useRef<HTMLInputElement>(null)
  // Built here, not at load, so the names follow the language.
  const visibilityOptions = [
    { value: KEEP, label: t.keep },
    ...VISIBILITIES.map((value) => ({
      value,
      label: VISIBILITY_NAMES[value],
    })),
  ]

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
          label={t.nickname}
          placeholder={t.keepAsIs}
          className={styles.input}
          maxLength={40}
          value={choice.nameTemplate}
          onChange={(event) =>
            onChange({ ...choice, nameTemplate: event.target.value })
          }
        />
        <p className={styles.note}>{t.templateNote}</p>
      </div>

      <div className={styles.privacy}>
        {PRIVACY.map((key) => (
          <Dropdown
            key={key}
            label={t.privacy[key]}
            size="sm"
            value={choice.privacy[key] ?? KEEP}
            options={visibilityOptions}
            onChange={(value) => setPrivacy(key, value)}
          />
        ))}
      </div>

      <div className={styles.option}>
        <span className={styles.avatarName}>
          {choice.avatar ? choice.avatar.name : t.avatarKeep}
        </span>
        <span className={styles.avatarActions}>
          {choice.avatar && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ ...choice, avatar: null })}
            >
              {t.remove}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => picker.current?.click()}
          >
            {choice.avatar ? words.common.change : t.chooseImage}
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
