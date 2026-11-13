import { useEffect, useState } from 'react'
import {
  AUTO_LOCK_CHOICES,
  exportBackup,
  getSettings,
  setAutoLock,
  setStreamerMode,
  showStreamerMode,
  type Settings as SettingsValues,
} from '../../../api/settings.ts'
import {
  BIOMETRIC_NAMES,
  biometricStatus,
  disableBiometrics,
  enableBiometrics,
  errorMessage,
  isCancelled,
  type BiometricStatus,
} from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { ago } from '../../../lib/ago.ts'
import layout from '../layout.module.css'
import ChangePassword from './ChangePassword.tsx'
import styles from './Settings.module.css'

const NEVER = 'never'

const AUTO_LOCK_OPTIONS = [
  ...AUTO_LOCK_CHOICES.map((minutes) => ({
    value: String(minutes),
    label: minutes === 60 ? '1 hour' : `${minutes} minutes`,
  })),
  { value: NEVER, label: 'Never' },
]

type Props = {
  /** The vault locks at a new time, which the sidebar shows. */
  onAutoLockChanged: () => void
}

export default function Settings({ onAutoLockChanged }: Props) {
  const [settings, setSettings] = useState<SettingsValues | null>(null)
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    void getSettings().then(setSettings)
    void biometricStatus().then(setBiometric)
  }, [])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNote('')
    try {
      await action()
    } catch (err) {
      if (!isCancelled(err)) setError(errorMessage(err))
    }
    setBusy(false)
  }

  const biometricName = biometric?.method
    ? BIOMETRIC_NAMES[biometric.method]
    : null

  return (
    <>
      <div className={layout.header}>
        <h1 className={layout.title}>Settings</h1>
      </div>

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="display-title">
          <h2 id="display-title" className={styles.sectionTitle}>
            Display
          </h2>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>Streamer mode</span>
              <span className={styles.hint}>
                Blurs Steam Guard codes, Steam IDs, trade URLs, balances and
                prices, for streams and screenshots.
              </span>
            </span>
            <Toggle
              on={settings?.streamerMode ?? false}
              label="Streamer mode"
              onChange={(on) =>
                void act(async () => {
                  await setStreamerMode(on)
                  showStreamerMode(on)
                  setSettings(
                    (current) => current && { ...current, streamerMode: on },
                  )
                })
              }
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="security-title">
          <h2 id="security-title" className={styles.sectionTitle}>
            Security
          </h2>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>Auto-lock</span>
              <span className={styles.hint}>
                Locks the vault after this long without activity. Auto-confirm
                runs only while it’s unlocked.
              </span>
            </span>
            <span className={styles.control}>
              <Dropdown
                label="Auto-lock"
                hideLabel
                size="sm"
                value={
                  settings
                    ? String(settings.autoLockMinutes ?? NEVER)
                    : String(15)
                }
                options={AUTO_LOCK_OPTIONS}
                onChange={(value) => {
                  const minutes = value === NEVER ? null : Number(value)
                  void act(async () => {
                    await setAutoLock(minutes)
                    onAutoLockChanged()
                    setSettings(
                      (current) =>
                        current && { ...current, autoLockMinutes: minutes },
                    )
                  })
                }}
              />
            </span>
          </div>

          {biometricName && biometric && (
            <div className={styles.row}>
              <span className={styles.words}>
                <span>Unlock with {biometricName}</span>
                <span className={styles.hint}>
                  The vault key is kept in the login keychain, and the app asks
                  for {biometricName} before using it.
                </span>
              </span>
              <Toggle
                on={biometric.enrolled}
                label={`Unlock with ${biometricName}`}
                onChange={(on) =>
                  void act(async () => {
                    await (on ? enableBiometrics() : disableBiometrics())
                    setBiometric({ ...biometric, enrolled: on })
                  })
                }
              />
            </div>
          )}

          <div className={styles.row}>
            <span>Master password</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChanging(true)}
            >
              Change
            </Button>
          </div>

          <div className={styles.row}>
            <span className={styles.words}>
              <span>Backup</span>
              <span className={styles.hint}>
                {backupNote(settings?.lastBackupAt ?? null)}
                The file holds every account and Guard secret, encrypted with
                the master password.
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              busy={busy}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (!(await exportBackup())) return
                  setNote('Backup saved')
                  setSettings(await getSettings())
                })
              }
            >
              Export
            </Button>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className={styles.note} role="status">
              {note}
            </p>
          )}
        </section>
      </div>

      <ChangePassword
        open={changing}
        biometricName={biometric?.enrolled ? biometricName : null}
        onClose={() => setChanging(false)}
        onChanged={() => {
          setChanging(false)
          setNote('Master password changed')
        }}
      />
    </>
  )
}

function backupNote(savedAt: number | null) {
  if (savedAt === null) return 'Not saved yet. '
  const when = ago(savedAt)
  return when === 'just now' ? 'Saved just now. ' : `Last saved ${when} ago. `
}
