import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import type { Game } from './inventory.ts'
import type { Visibility } from './profile.ts'

export type TaskInput =
  | { kind: 'check' }
  | { kind: 'acceptGifts'; onlyOwn: boolean }
  | {
      kind: 'profile'
      /** `{n}` becomes the account's place in the task, from 1. */
      nameTemplate: string | null
      /** A setting left out keeps what each account has. */
      privacy: Partial<Record<'profile' | 'inventory' | 'games', Visibility>>
      /** The image's bytes, for every account. */
      avatar: number[] | null
    }
  /** Store links or IDs, split by spaces, commas or lines. */
  | { kind: 'freeGames'; licenses: string }
  /** App IDs or store links; empty plays each account's own list. */
  | { kind: 'hourBoost'; games: string }
  | { kind: 'goOffline' }
  /** Plays the games with card drops left until they run out. */
  | { kind: 'cardFarming' }
  /** Discovery queues to view, up to 3, and the free daily sale item. */
  | { kind: 'events'; queues: number; claimItem: boolean }
  /** Every tradable item to one account. */
  | { kind: 'moveToStorage'; storage: string; game: Game }

export type Pacing = {
  /** How many accounts run at the same time. */
  atOnce: number
  /** A random pause between accounts, in seconds. */
  pauseMin: number
  pauseMax: number
  /** Failed accounts go to the back of the line, up to three tries in all. */
  retry: boolean
}

export type Run = { accountName: string; tries: number } & (
  | { state: 'waiting' }
  | { state: 'running' }
  | { state: 'done'; note: string }
  | { state: 'warning'; note: string }
  | { state: 'failed'; reason: string }
  /** The job stopped before this account's turn. */
  | { state: 'skipped' }
)

export type Job = {
  id: number
  title: string
  /** What it runs on, like a group's name. */
  target: string
  runs: Run[]
  startedAt: number
  finishedAt: number | null
}

export const startTask = (request: {
  task: TaskInput
  title: string
  target: string
  accountNames: string[]
  pacing: Pacing
}) => invoke<number>('start_task', { request })

/** Newest first. */
export const taskQueue = () =>
  invoke<Job[]>('task_queue').then((jobs) =>
    jobs.map((job) => ({ ...job, runs: job.runs.map(translateRun) })),
  )

function translateRun(run: Run): Run {
  switch (run.state) {
    case 'done':
    case 'warning':
      return { ...run, note: fromBackend(run.note) }
    case 'failed':
      return { ...run, reason: fromBackend(run.reason) }
    default:
      return run
  }
}

/** Accounts already running finish; the rest are skipped. */
export const cancelTask = (id: number) => invoke<void>('cancel_task', { id })

export const clearFinishedTasks = () => invoke<void>('clear_finished_tasks')
