import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import type { Job } from '../../../api/tasks.ts'
import { useT } from '../../../i18n/index.ts'
import layout from '../layout.module.css'
import Queue from './Queue.tsx'
import TaskDialog, { type Kind } from './TaskDialog.tsx'
import styles from './Tasks.module.css'

// What the tasks are for; names and descriptions are in the dictionary.
const SECTIONS: {
  id: 'playing' | 'profile' | 'items' | 'store' | 'checks'
  kinds: Kind[]
}[] = [
  { id: 'playing', kinds: ['hourBoost', 'cardFarming', 'goOffline'] },
  { id: 'profile', kinds: ['profile', 'joinGroups', 'wishlist'] },
  { id: 'items', kinds: ['moveToStorage', 'acceptGifts'] },
  { id: 'store', kinds: ['freeGames', 'events'] },
  { id: 'checks', kinds: ['check'] },
]

type Props = {
  accounts: Account[]
  groups: Group[]
}

/** Tasks by what they're for; one opens to pick its accounts and settings. */
export default function Tasks({ accounts, groups }: Props) {
  const t = useT().tasks
  const [open, setOpen] = useState<Kind | null>(null)
  const [started, setStarted] = useState(0)
  const [jobs, setJobs] = useState<Job[]>([])
  const running = new Set(
    jobs.filter((job) => job.finishedAt === null).map((job) => job.kind),
  )

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          <span className={styles.subtitle}>{t.subtitle}</span>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`tasks-${section.id}`}>
              <h2 id={`tasks-${section.id}`} className={styles.sectionTitle}>
                {t.sections[section.id]}
              </h2>
              <div className={styles.cards}>
                {section.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={styles.card}
                    onClick={() => setOpen(kind)}
                  >
                    <span className={styles.cardHead}>
                      {t.kinds[kind].name}
                      {running.has(kind) && (
                        <span className={styles.running}>
                          <span className={styles.runningDot} />
                          {t.running}
                        </span>
                      )}
                    </span>
                    <span className={styles.cardText}>
                      {t.kinds[kind].text}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Queue started={started} onJobs={setJobs} />
      </div>

      <TaskDialog
        kind={open}
        accounts={accounts}
        groups={groups}
        onClose={() => setOpen(null)}
        onStarted={() => setStarted((n) => n + 1)}
      />
    </>
  )
}
