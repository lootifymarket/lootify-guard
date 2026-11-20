import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import type { DescriptionSource } from './tasks.ts'

export type PlanRequest = {
  /** What it runs on, like a group's name. */
  target: string
  accountNames: string[]
  days: number
  /** Local hours the steps run between, and the computer's clock against UTC. */
  window: { fromHour: number; toHour: number; utcOffsetMinutes: number }
  /** Each step left `null` is left out of the plan. */
  description: DescriptionSource | null
  /** Group links, one group a day. */
  groups: string | null
  /** App IDs or store links; empty takes the built-in popular games. */
  wishlist: { games: string; size: 'small' | 'medium' | 'large' } | null
  queue: boolean
}

export type PlanAccount = {
  accountName: string
  /** How its last step went. */
  note: string | null
  state: 'waiting' | 'done' | 'stopped'
  nextAt: number | null
}

export type Plan = {
  id: number
  target: string
  startedAt: number
  /** The day it's on, from 1. */
  day: number
  days: number
  /** Steps due today, and how many of them are done. */
  today: number
  doneToday: number
  /** When the next step is due, in Unix seconds; `null` once it's finished. */
  nextAt: number | null
  finished: boolean
  accounts: PlanAccount[]
}

/** Resolves to the new plan's id. */
export const startPlan = (request: PlanRequest) =>
  invoke<number>('start_plan', { request })

/** Newest first. */
export const planQueue = () =>
  invoke<Plan[]>('plan_queue').then((plans) =>
    plans.map((plan) => ({
      ...plan,
      accounts: plan.accounts.map((account) => ({
        ...account,
        note: account.note && fromBackend(account.note),
      })),
    })),
  )

/** What its steps did stays done. */
export const cancelPlan = (id: number) => invoke<void>('cancel_plan', { id })
