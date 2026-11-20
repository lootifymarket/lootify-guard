import { useEffect, useState } from 'react'
import {
  AUTO_LOCK_CHOICES,
  appVersion,
  exportBackup,
  getSettings,
  launchAtStartup,
  saveLanguage,
  setAutoLock,
  setCloseToTray,
  setTasksWhileLocked,
  setLaunchAtStartup,
  type Settings as SettingsValues,
} from '../../../api/settings.ts'
import {
  checkForUpdates,
  setAutoUpdate,
  type UpdateStatus,
} from '../../../api/updates.ts'
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
import { useStreamerMode } from '../../../lib/streamer.ts'
import { useToast } from '../../../lib/toast.ts'
import layout from '../layout.module.css'
import ChangePassword from './ChangePassword.tsx'
import styles from './Settings.module.css'

const NEVER = 'never'

type Props = {
  update: UpdateStatus
  /** Opens the update window. */
  onUpdate: () => void
  /** The update's status moved on; read it again. */
  onUpdateChanged: () => void
  /** The vault locks at a new time, which the sidebar shows. */
  onAutoLockChanged: () => void
}

export default function Settings({
  update,
  onUpdate,
  onUpdateChanged,
  onAutoLockChanged,
}: Props) {
  const { language, t: words, setLanguage } = useLanguage()
  const t = words.settings
  const streamer = useStreamerMode()
  const toast = useToast()
  const [settings, setSettings] = useState<SettingsValues | null>(null)
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null)
  const [atStartup, setAtStartup] = useState(false)
  const [version, setVersion] = useState('')
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void getSettings().then(setSettings)
    void biometricStatus().then(setBiometric)
    void launchAtStartup().then(setAtStartup)
    void appVersion().then(setVersion)
  }, [])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
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
            <span className={styles.controlWide}>
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
              on={streamer.on}
              label={t.streamer}
              onChange={(on) => void act(() => streamer.set(on))}
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

          <div className={styles.row}>
            <span className={styles.words}>
              <span>{t.tasksWhileLocked}</span>
              <span className={styles.hint}>{t.tasksWhileLockedHint}</span>
            </span>
            <Toggle
              on={settings?.tasksWhileLocked ?? false}
              label={t.tasksWhileLocked}
              onChange={(on) =>
                void act(async () => {
                  await setTasksWhileLocked(on)
                  setSettings(
                    (current) =>
                      current && { ...current, tasksWhileLocked: on },
                  )
                })
              }
            />
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
              className={styles.action}
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
              className={styles.action}
              busy={busy}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (!(await exportBackup())) return
                  toast(t.backupSaved)
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

        <section className={styles.section} aria-labelledby="updates-title">
          <h2 id="updates-title" className={styles.sectionTitle}>
            {words.updates.settings.title}
          </h2>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>{words.updates.settings.auto}</span>
              <span className={styles.hint}>
                {words.updates.settings.autoHint}
              </span>
            </span>
            <Toggle
              on={settings?.autoUpdate ?? true}
              label={words.updates.settings.auto}
              onChange={(on) =>
                void act(async () => {
                  await setAutoUpdate(on)
                  setSettings(
                    (current) => current && { ...current, autoUpdate: on },
                  )
                  onUpdateChanged()
                })
              }
            />
          </div>
          <div className={styles.row}>
            <span className={styles.words}>
              <span>
                {words.updates.settings.version}{' '}
                <span className={styles.version}>{version}</span>
              </span>
              <UpdateNote update={update} />
            </span>
            {update.state === 'available' || update.state === 'ready' ? (
              <Button size="sm" onClick={onUpdate}>
                {update.state === 'ready'
                  ? words.updates.settings.restart
                  : words.updates.settings.update}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                busy={update.state === 'checking'}
                disabled={
                  update.state === 'checking' || update.state === 'downloading'
                }
                onClick={() =>
                  void checkForUpdates().then(onUpdateChanged, onUpdateChanged)
                }
              >
                {words.updates.settings.check}
              </Button>
            )}
          </div>
        </section>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <ChangePassword
        open={changing}
        biometricName={biometric?.enrolled ? biometricName : null}
        onClose={() => setChanging(false)}
        onChanged={() => {
          setChanging(false)
          toast(t.passwordChanged)
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

/** Where the next version stands, in a line. */
function UpdateNote({ update }: { update: UpdateStatus }) {
  const { t: words } = useLanguage()
  const t = words.updates.settings
  let note: string
  switch (update.state) {
    case 'notChecked':
      note = t.notChecked
      break
    case 'checking':
      note = t.checking
      break
    case 'upToDate': {
      const when = ago(update.checkedAt)
      note = when === words.time.justNow ? t.upToDateNow : t.upToDate(when)
      break
    }
    case 'available':
      note = t.availableNote(update.release.version)
      break
    case 'downloading':
      note = t.downloadingNote(
        update.release.version,
        update.total ? Math.round((update.downloaded / update.total) * 100) : 0,
      )
      break
    case 'ready':
      note = t.readyNote(update.release.version)
      break
    case 'failed':
      note = t.failedNote
  }
  return (
    <span
      className={styles.hint}
      data-tone={update.state === 'failed' ? 'danger' : undefined}
    >
      {note}
    </span>
  )
}
