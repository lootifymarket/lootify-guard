import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import { words } from '../i18n/index.ts'
import type { Confirmation } from './confirmations.ts'

export type AutoConfirm = {
  tradesToOwnAccounts: boolean
  anyMarketListing: boolean
}

export type AutoConfirmRule = keyof AutoConfirm

type RuleWords = {
  label: string
  short: string
  hint: string
  /** Shown while the rule is on, for rules that can be abused. */
  warning?: string
}

/**
 * The rules with their words. The words are read when used, so they follow
 * the language picked after this module loaded.
 */
export const AUTO_CONFIRM_RULES: ({ rule: AutoConfirmRule } & RuleWords)[] = (
  ['tradesToOwnAccounts', 'anyMarketListing'] as const
).map((rule) => {
  const text = (): RuleWords => words().guard.rules[rule]
  return {
    rule,
    get label() {
      return text().label
    },
    get short() {
      return text().short
    },
    get hint() {
      return text().hint
    },
    get warning() {
      return text().warning
    },
  }
})

export type AutoConfirmLog = {
  paused: boolean
  /** Newest first. */
  accepted: {
    accountName: string
    confirmation: Confirmation
    /** Unix seconds. */
    acceptedAt: number
  }[]
  /** Accounts whose latest check failed. */
  failures: { accountName: string; reason: string }[]
}

export const setAutoConfirmRule = (
  accountNames: string[],
  rule: AutoConfirmRule,
  on: boolean,
) => invoke<void>('set_auto_confirm_rule', { accountNames, rule, on })

/** Stops every rule at once, until resumed. */
export const setAutoConfirmPaused = (paused: boolean) =>
  invoke<void>('set_auto_confirm_paused', { paused })

export const autoConfirmLog = () =>
  invoke<AutoConfirmLog>('auto_confirm_log').then((log) => ({
    ...log,
    failures: log.failures.map((failure) => ({
      ...failure,
      reason: fromBackend(failure.reason),
    })),
  }))
