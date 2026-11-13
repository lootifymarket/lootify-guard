import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { startTask, type TaskInput } from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import Toggle from '../../../components/Toggle.tsx'
import layout from '../layout.module.css'
import Queue from './Queue.tsx'
import styles from './Tasks.module.css'

type Kind = TaskInput['kind']

const TASKS: { kind: Kind; name: string; text: string }[] = [
  {
    kind: 'check',
    name: 'Check',
    text: 'Session, profile, Web API key, bans and limits',
  },
  {
    kind: 'acceptGifts',
    name: 'Accept gifts',
    text: 'Incoming offers where the account gives nothing',
  },
]

const AT_ONCE = [1, 2, 3, 5, 10]

const PAUSES: { value: string; label: string; min: number; max: number }[] = [
  { value: 'none', label: 'None', min: 0, max: 0 },
  { value: 'short', label: '2–5 s', min: 2, max: 5 },
  { value: 'medium', label: '5–20 s', min: 5, max: 20 },
  { value: 'long', label: '30–90 s', min: 30, max: 90 },
]

/** Every account, the ones in no group, or a group by id. */
type Target = 'all' | 'none' | number

type Props = {
  accounts: Account[]
  groups: Group[]
}

/** Runs one action on many accounts, with limits and random pauses. */
export default function Tasks({ accounts, groups }: Props) {
  const [target, setTarget] = useState<Target>('all')
  const [kind, setKind] = useState<Kind>('check')
  const [onlyOwn, setOnlyOwn] = useState(true)
  const [atOnce, setAtOnce] = useState(3)
  const [pause, setPause] = useState('medium')
  const [retry, setRetry] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(0)

  const loose = accounts.filter((account) => account.groupId === null)
  const targets: { id: Target; name: string; accounts: Account[] }[] = [
    { id: 'all', name: 'All accounts', accounts },
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      accounts: accounts.filter((account) => account.groupId === group.id),
    })),
    ...(groups.length > 0 && loose.length > 0
      ? [{ id: 'none' as const, name: 'No group', accounts: loose }]
      : []),
  ]
  const chosen = targets.find((item) => item.id === target) ?? targets[0]
  const task = TASKS.find((item) => item.kind === kind) ?? TASKS[0]

  async function run() {
    const range = PAUSES.find((item) => item.value === pause) ?? PAUSES[0]
    setBusy(true)
    setError('')
    try {
      await startTask({
        task: kind === 'check' ? { kind } : { kind, onlyOwn },
        title: task.name,
        target: chosen.name,
        accountNames: chosen.accounts.map((account) => account.accountName),
        pacing: { atOnce, pauseMin: range.min, pauseMax: range.max, retry },
      })
      setStarted((n) => n + 1)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>Tasks</h1>
          <span className={styles.subtitle}>
            Run actions on a whole group of accounts, with limits and random
            pauses
          </span>
        </div>
      </div>

      <div className={styles.columns}>
        <section className={styles.targets} aria-labelledby="targets-title">
          <h2 id="targets-title" className={styles.sectionTitle}>
            Groups
          </h2>
          {targets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.target}
              aria-pressed={item.id === chosen.id}
              onClick={() => setTarget(item.id)}
            >
              <span>{item.name}</span>
              <span className={styles.count}>{item.accounts.length}</span>
            </button>
          ))}
          <p className={styles.hint}>Make groups on the Accounts screen.</p>
        </section>

        <section className={styles.setup} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.sectionTitle}>
            {chosen.name}
          </h2>
          <div className={styles.tasks} role="radiogroup" aria-label="Task">
            {TASKS.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="radio"
                aria-checked={item.kind === kind}
                className={styles.task}
                onClick={() => setKind(item.kind)}
              >
                <span className={styles.taskName}>{item.name}</span>
                <span className={styles.taskText}>{item.text}</span>
              </button>
            ))}
          </div>

          {kind === 'acceptGifts' && (
            <div className={styles.option}>
              <span>Only from my accounts</span>
              <Toggle
                on={onlyOwn}
                label="Only from my accounts"
                onChange={setOnlyOwn}
              />
            </div>
          )}

          <div className={styles.pacing}>
            <Dropdown
              label="At once"
              size="sm"
              value={String(atOnce)}
              options={AT_ONCE.map((n) => ({
                value: String(n),
                label: n === 1 ? 'One by one' : `${n} accounts`,
              }))}
              onChange={(value) => setAtOnce(Number(value))}
            />
            <Dropdown
              label="Pause between accounts"
              size="sm"
              value={pause}
              options={PAUSES}
              onChange={setPause}
            />
          </div>
          <div className={styles.option}>
            <span>Retry failed accounts (up to 3 times)</span>
            <Toggle
              on={retry}
              label="Retry failed accounts"
              onChange={setRetry}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.run}>
            <Button
              busy={busy}
              disabled={busy || chosen.accounts.length === 0}
              onClick={() => void run()}
            >
              Run on {chosen.name} ({chosen.accounts.length})
            </Button>
          </div>
        </section>

        <Queue started={started} />
      </div>
    </>
  )
}
