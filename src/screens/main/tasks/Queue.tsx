import { useEffect, useEffectEvent, useState } from 'react'
import {
  cancelTask,
  clearFinishedTasks,
  taskQueue,
  type Job,
  type Run,
} from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import styles from './Tasks.module.css'

// Jobs move a few seconds per account, so this keeps up without much asking.
const POLL_MS = 2000
const SKELETON_JOBS = 4

type Props = {
  /** Goes up whenever a job starts, so the queue asks again at once. */
  started: number
}

type JobState = 'running' | 'stopped' | 'error' | 'done'

export default function Queue({ started }: Props) {
  const t = useT().tasks.queue
  const toast = useToast()
  // `null` until the first answer.
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)

  const loaded = useEffectEvent((next: Job[]) => {
    setJobs(next)
    setError('')
  })
  const failed = useEffectEvent((err: unknown) => setError(errorMessage(err)))
  useEffect(() => {
    let current = true
    const load = () =>
      void taskQueue().then(
        (next) => current && loaded(next),
        (err: unknown) => current && failed(err),
      )
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [started, revision])

  const finished = jobs?.some((job) => job.finishedAt !== null) ?? false
  const open = jobs?.find((job) => job.id === openId)

  return (
    <section className={styles.queue} aria-labelledby="queue-title">
      <div className={styles.queueHead}>
        <h2 id="queue-title" className={styles.sectionTitle}>
          {t.title}
        </h2>
        {finished && (
          <button
            type="button"
            className={styles.link}
            onClick={() =>
              void clearFinishedTasks().then(() => setRevision((n) => n + 1))
            }
          >
            {t.clearFinished}
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {jobs === null && !error && (
        <div>
          {Array.from({ length: SKELETON_JOBS }, (_, i) => (
            <div key={i} className={styles.jobSkeleton}>
              <Skeleton width="60%" height={13} />
              <Skeleton width="40%" height={10} />
              <Skeleton height={2} radius={0} />
            </div>
          ))}
        </div>
      )}
      {jobs?.length === 0 && <p className={styles.empty}>{t.empty}</p>}
      {jobs && jobs.length > 0 && (
        <div className="rise">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onOpen={() => setOpenId(job.id)} />
          ))}
        </div>
      )}
      <Dialog
        open={open !== undefined}
        title={open ? `${open.title} · ${open.target}` : ''}
        onClose={() => setOpenId(null)}
      >
        {open && (
          <Log
            job={open}
            onClose={() => setOpenId(null)}
            onStop={() =>
              void cancelTask(open.id).then(() => {
                setOpenId(null)
                setRevision((n) => n + 1)
                toast(t.stoppedToast)
              })
            }
          />
        )}
      </Dialog>
    </section>
  )
}

function stateOf(job: Job): JobState {
  if (job.finishedAt === null) return 'running'
  if (job.runs.some((run) => run.state === 'skipped')) return 'stopped'
  if (job.runs.some((run) => run.state === 'failed')) return 'error'
  return 'done'
}

function JobRow({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const t = useT().tasks.queue
  const done = job.runs.filter((run) => isOver(run)).length
  const problems = job.runs.filter(
    (run) => run.state === 'failed' || run.state === 'warning',
  ).length
  const state = stateOf(job)
  return (
    <button
      type="button"
      className={styles.job}
      data-state={state}
      onClick={onOpen}
    >
      <span className={styles.jobHead}>
        <span className={styles.jobName}>{job.title}</span>
        <span className={styles.jobState}>{t[state]}</span>
      </span>
      <span className={styles.jobMeta}>
        {job.target} · {t.of(done, job.runs.length)}
        {problems > 0 && ` · ${t.toLookAt(problems)}`}
      </span>
      <span className={styles.bar}>
        <span
          className={styles.barFill}
          style={{ width: `${(done / job.runs.length) * 100}%` }}
        />
      </span>
    </button>
  )
}

/** How it went for each account of the job. */
function Log({
  job,
  onClose,
  onStop,
}: {
  job: Job
  onClose: () => void
  onStop: () => void
}) {
  const words = useT()
  const t = words.tasks.queue
  const running = job.finishedAt === null
  return (
    <>
      <ul className={styles.runs}>
        {job.runs.map((run) => (
          <li key={run.accountName} data-state={run.state}>
            <span className={styles.runName}>{run.accountName}</span>
            <span className={styles.runNote}>{note(t, run)}</span>
          </li>
        ))}
      </ul>
      <div className={dialogStyles.actions}>
        {running ? (
          <Button variant="secondary" size="sm" onClick={onStop}>
            <span className={styles.stop}>{t.stop}</span>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t.close}
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          {t.ok}
        </Button>
      </div>
    </>
  )
}

const isOver = (run: Run) => run.state !== 'waiting' && run.state !== 'running'

function note(t: Dictionary['tasks']['queue'], run: Run) {
  switch (run.state) {
    case 'waiting':
      return run.tries > 0 ? t.waitingRetry(run.tries) : t.waiting
    case 'running':
      return t.runningAccount
    case 'done':
    case 'warning':
      return run.note
    case 'failed':
      return run.reason
    case 'skipped':
      return t.skipped
  }
}
