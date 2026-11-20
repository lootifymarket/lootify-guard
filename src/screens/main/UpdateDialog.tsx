import { useEffect, useState } from 'react'
import { farmingNow, playingNow } from '../../api/playing.ts'
import { appVersion } from '../../api/settings.ts'
import { taskQueue } from '../../api/tasks.ts'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  releaseSections,
  type Release,
  type UpdateStatus,
} from '../../api/updates.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import { useT } from '../../i18n/index.ts'
import styles from './UpdateDialog.module.css'

const MB = 1024 * 1024

type Props = {
  open: boolean
  status: UpdateStatus
  /** Set after a restart into a new version: only its notes are shown. */
  installed: { version: string; notes: string | null } | null
  /** Browser tabs open now, which a restart closes. */
  openTabs: number
  onClose: () => void
  /** The update's status moved on; read it again. */
  onChanged: () => void
}

/** The next version: what's in it, then downloading it and restarting into it. */
export default function UpdateDialog(props: Props) {
  const t = useT().updates
  const release = props.installed
    ? { ...props.installed, date: null }
    : 'release' in props.status
      ? props.status.release
      : null
  if (!release) return null
  return (
    <Dialog
      open={props.open}
      title={t.title(release.version)}
      onClose={props.onClose}
    >
      <Steps {...props} release={release} />
    </Dialog>
  )
}

function Steps({
  status,
  installed,
  openTabs,
  release,
  onClose,
  onChanged,
}: Props & { release: Release }) {
  const t = useT().updates
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState<string[]>([])
  const [warning, setWarning] = useState(false)
  // Asked to update while the download was still to come: restart once it's in.
  const [restartWhenReady, setRestartWhenReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void appVersion().then((version) => {
      if (active) setCurrent(version)
    })
    void Promise.all([taskQueue(), playingNow(), farmingNow()]).then(
      ([jobs, players, farms]) => {
        if (!active) return
        const tasks = jobs.filter((job) => job.finishedAt === null).length
        const playing = new Set([
          ...players.map((player) => player.accountName),
          ...farms.map((farm) => farm.accountName),
        ]).size
        setBusy(
          [
            tasks > 0 && t.busyTasks(tasks),
            playing > 0 && t.busyGames(playing),
            openTabs > 0 && t.busyTabs(openTabs),
          ].filter((line): line is string => typeof line === 'string'),
        )
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [openTabs, t])

  useEffect(() => {
    if (!restartWhenReady || status.state !== 'ready') return
    installUpdate().catch((err: unknown) => {
      setRestartWhenReady(false)
      setError(errorMessage(err))
    })
  }, [restartWhenReady, status.state])

  function go() {
    setWarning(false)
    setError(null)
    if (status.state === 'ready') {
      setRestartWhenReady(true)
      return
    }
    if (status.state === 'failed' && !status.release) {
      void checkForUpdates().then(onChanged)
      return
    }
    setRestartWhenReady(true)
    void downloadUpdate().then(onChanged)
  }

  function restart() {
    if (busy.length > 0 && !warning) setWarning(true)
    else go()
  }

  const sections = releaseSections(release.notes)
  const working =
    status.state === 'downloading' ||
    (restartWhenReady && status.state === 'ready')
  const failed = status.state === 'failed' && !working

  return (
    <>
      <p className={styles.sub}>
        {installed ? t.installedNow : current && t.youHave(current)}
      </p>

      {!warning && !working && (
        <div className={styles.notes}>
          {sections.length === 0 ? (
            <>
              <span className={styles.label}>{t.whatsNew}</span>
              <span className={styles.muted}>{t.noNotes}</span>
            </>
          ) : (
            sections.map((section, index) => (
              <section key={index} className={styles.section}>
                <h3 className={styles.label}>{section.title ?? t.whatsNew}</h3>
                <ul className={styles.list}>
                  {section.points.map((point, index) => (
                    <li key={index}>
                      {point.lead && (
                        <strong className={styles.lead}>{point.lead}</strong>
                      )}{' '}
                      {point.text}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      {warning && (
        <div className={styles.warning}>
          <span className={styles.warningTitle}>{t.busyTitle}</span>
          <ul className={styles.busy}>
            {busy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <span className={styles.muted}>{t.busyAfter}</span>
        </div>
      )}

      {working && (
        <div className={styles.progress} role="status">
          <span className={styles.progressRow}>
            <span>
              {status.state === 'downloading'
                ? t.downloading(release.version)
                : t.installing}
            </span>
            {status.state === 'downloading' && status.total !== null && (
              <span className={styles.size}>
                {t.progress(
                  (status.downloaded / MB).toFixed(1),
                  (status.total / MB).toFixed(1),
                )}
              </span>
            )}
          </span>
          <span className={styles.bar}>
            <span
              className={styles.barFill}
              style={{
                width:
                  status.state === 'downloading'
                    ? `${status.total ? (status.downloaded / status.total) * 100 : 0}%`
                    : '100%',
              }}
            />
          </span>
          <span className={styles.muted}>{t.signed}</span>
        </div>
      )}

      {(failed || error) && (
        <p className={styles.error} role="alert">
          {error ?? t.failed}
        </p>
      )}

      <div className={styles.actions}>
        {installed ? (
          <Button size="sm" onClick={onClose}>
            {t.close}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={warning ? () => setWarning(false) : onClose}
            >
              {warning ? t.back : working ? t.hide : t.later}
            </Button>
            {!working && (
              <Button size="sm" onClick={restart}>
                {warning
                  ? t.restartAnyway
                  : failed
                    ? t.tryAgain
                    : status.state === 'ready'
                      ? t.restartNow
                      : t.updateAndRestart}
              </Button>
            )}
          </>
        )}
      </div>
    </>
  )
}
