import { invoke } from '@tauri-apps/api/core'

export type TaskInput =
  { kind: 'check' } | { kind: 'acceptGifts'; onlyOwn: boolean }

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
export const taskQueue = () => invoke<Job[]>('task_queue')

/** Accounts already running finish; the rest are skipped. */
export const cancelTask = (id: number) => invoke<void>('cancel_task', { id })

export const clearFinishedTasks = () => invoke<void>('clear_finished_tasks')
