import { useEffect, useEffectEvent, useState } from 'react'
import {
  cancelTask,
  clearFinishedTasks,
  taskQueue,
  type Job,
  type Run,
} from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import styles from './Tasks.module.css'

// Jobs move a few seconds per account, so this keeps up without much asking.
const POLL_MS = 2000

type Props = {
  /** Goes up whenever a job starts, so the queue asks again at once. */
  started: number
}

export default function Queue({ started }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(null)
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

  const finished = jobs.some((job) => job.finishedAt !== null)

  return (
    <section className={styles.queue} aria-labelledby="queue-title">
      <div className={styles.queueHead}>
        <h2 id="queue-title" className={styles.sectionTitle}>
          Queue
        </h2>
        {finished && (
          <button
            type="button"
            className={styles.link}
            onClick={() =>
              void clearFinishedTasks().then(() => setRevision((n) => n + 1))
            }
          >
            Clear finished
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {jobs.length === 0 && <p className={styles.hint}>Nothing has run yet.</p>}
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          open={open === job.id}
          onToggle={() => setOpen(open === job.id ? null : job.id)}
          onCancel={() =>
            void cancelTask(job.id).then(() => setRevision((n) => n + 1))
          }
        />
      ))}
    </section>
  )
}

function JobCard({
  job,
  open,
  onToggle,
  onCancel,
}: {
  job: Job
  open: boolean
  onToggle: () => void
  onCancel: () => void
}) {
  const done = job.runs.filter((run) => isOver(run)).length
  const problems = job.runs.filter(
    (run) => run.state === 'failed' || run.state === 'warning',
  ).length
  const skipped = job.runs.some((run) => run.state === 'skipped')
  const state =
    job.finishedAt === null ? 'Running' : skipped ? 'Stopped' : 'Done'
  return (
    <div className={styles.job} data-state={state.toLowerCase()}>
      <div className={styles.jobHead}>
        <span className={styles.jobWords}>
          <span className={styles.jobName}>{job.title}</span>
          <span className={styles.hint}>
            {job.target} · {done} / {job.runs.length}
            {problems > 0 && ` · ${problems} to look at`}
          </span>
        </span>
        <span className={styles.jobState}>{state}</span>
      </div>
      <span className={styles.bar}>
        <span
          className={styles.barFill}
          style={{ width: `${(done / job.runs.length) * 100}%` }}
        />
      </span>
      <div className={styles.jobTools}>
        <button
          type="button"
          className={styles.link}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? 'Hide accounts' : 'Show accounts'}
        </button>
        {job.finishedAt === null && (
          <button type="button" className={styles.link} onClick={onCancel}>
            Stop
          </button>
        )}
      </div>
      {open && (
        <ul className={styles.runs}>
          {job.runs.map((run) => (
            <li key={run.accountName} data-state={run.state}>
              <span className={styles.runName}>{run.accountName}</span>
              <span className={styles.runNote}>{note(run)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const isOver = (run: Run) => run.state !== 'waiting' && run.state !== 'running'

function note(run: Run) {
  switch (run.state) {
    case 'waiting':
      return run.tries > 0
        ? `Waiting to try again (${run.tries} of 3)`
        : 'Waiting'
    case 'running':
      return 'Running…'
    case 'done':
    case 'warning':
      return run.note
    case 'failed':
      return run.reason
    case 'skipped':
      return 'Skipped'
  }
}
