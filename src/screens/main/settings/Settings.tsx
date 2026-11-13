import { useEffect, useState } from 'react'
import {
  AUTO_LOCK_CHOICES,
  exportBackup,
  getSettings,
  launchAtStartup,
  saveLanguage,
  setAutoLock,
  setCloseToTray,
  setLaunchAtStartup,
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
import {
  LANGUAGES,
  useLanguage,
  type Dictionary,
  type Language,
} from '../../../i18n/index.ts'
import { ago } from '../../../lib/ago.ts'
import layout from '../layout.module.css'
import ChangePassword from './ChangePassword.tsx'
import styles from './Settings.module.css'

const NEVER = 'never'

type Props = {
  /** The vault locks at a new time, which the sidebar shows. */
  onAutoLockChanged: () => void
}

export default function Settings({ onAutoLockChanged }: Props) {
  const { language, t: words, setLanguage } = useLanguage()
  const t = words.settings
  const [settings, setSettings] = useState<SettingsValues | null>(null)
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null)
  const [atStartup, setAtStartup] = useState(false)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    void getSettings().then(setSettings)
    void biometricStatus().then(setBiometric)
    void launchAtStartup().then(setAtStartup)
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
  const autoLockOptions = [
    ...AUTO_LOCK_CHOICES.map((minutes) => ({
      value: String(minutes),
      label: t.minutes(minutes),
    })),
    { value: NEVER, label: t.never },
  ]

  return (
    <>
      <div className={layout.header}>
        <h1 className={layout.title}>{t.title}</h1>
      </div>

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="display-title">
          <h2 id="display-title" className={styles.sectionTitle}>
            {t.display}
          </h2>
          <div className={styles.row}>
            <span>{t.language}</span>
            <span className={styles.control}>
              <Dropdown
                label={t.language}
                hideLabel
                size="sm"
                value={language}
                options={LANGUAGES}
                onChange={(value) =>
                  void act(async () => {
                    await saveLanguage(value as Language)
                    setLanguage(value as Language)
                  })
                }
              />
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.streamer}</span>
              <span className={styles.hint}>{t.streamerHint}</span>
            </span>
            <Toggle
              on={settings?.streamerMode ?? false}
              label={t.streamer}
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
            {t.security}
          </h2>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.autoLock}</span>
              <span className={styles.hint}>{t.autoLockHint}</span>
            </span>
            <span className={styles.control}>
              <Dropdown
                label={t.autoLock}
                hideLabel
                size="sm"
                value={
                  settings
                    ? String(settings.autoLockMinutes ?? NEVER)
                    : String(15)
                }
                options={autoLockOptions}
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
                <span>{t.unlockWith(biometricName)}</span>
                <span className={styles.hint}>
                  {t.biometricHint(biometricName)}
                </span>
              </span>
              <Toggle
                on={biometric.enrolled}
                label={t.unlockWith(biometricName)}
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
            <span>{t.masterPassword}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChanging(true)}
            >
              {words.common.change}
            </Button>
          </div>

          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.backup}</span>
              <span className={styles.hint}>
                {backupNote(t, settings?.lastBackupAt ?? null)}
                {t.backupHint}
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
                  setNote(t.backupSaved)
                  setSettings(await getSettings())
                })
              }
            >
              {words.common.export}
            </Button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="app-title">
          <h2 id="app-title" className={styles.sectionTitle}>
            {t.app}
          </h2>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.startup}</span>
              <span className={styles.hint}>{t.startupHint}</span>
            </span>
            <Toggle
              on={atStartup}
              label={t.startup}
              onChange={(on) =>
                void act(async () => {
                  await setLaunchAtStartup(on)
                  setAtStartup(on)
                })
              }
            />
          </div>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.tray}</span>
              <span className={styles.hint}>{t.trayHint}</span>
            </span>
            <Toggle
              on={settings?.closeToTray ?? true}
              label={t.tray}
              onChange={(on) =>
                void act(async () => {
                  await setCloseToTray(on)
                  setSettings(
                    (current) => current && { ...current, closeToTray: on },
                  )
                })
              }
            />
          </div>
        </section>

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
      </div>

      <ChangePassword
        open={changing}
        biometricName={biometric?.enrolled ? biometricName : null}
        onClose={() => setChanging(false)}
        onChanged={() => {
          setChanging(false)
          setNote(t.passwordChanged)
        }}
      />
    </>
  )
}

function backupNote(t: Dictionary['settings'], savedAt: number | null) {
  if (savedAt === null) return t.backupNever
  return Date.now() / 1000 - savedAt < 60
    ? t.backupJustNow
    : t.backupAgo(ago(savedAt))
}
