import { invoke } from '@tauri-apps/api/core'
import type { Confirmation } from './confirmations.ts'

export type AutoConfirm = {
  tradesToOwnAccounts: boolean
  anyMarketListing: boolean
}

export type AutoConfirmRule = keyof AutoConfirm

export const AUTO_CONFIRM_RULES: {
  rule: AutoConfirmRule
  label: string
  short: string
  hint: string
  /** Shown while the rule is on, for rules that can be abused. */
  warning?: string
}[] = [
  {
    rule: 'tradesToOwnAccounts',
    label: 'Trades to my accounts',
    short: 'To my accounts',
    hint: 'Items going to another account in this vault. Steam is asked who the other side is; the offer’s text isn’t trusted.',
  },
  {
    rule: 'anyMarketListing',
    label: 'Any market listing',
    short: 'Any listing',
    hint: 'Every listing on the Steam market, made here or anywhere else.',
    warning:
      'Listings made by anyone who gets into this Steam session are confirmed too.',
  },
]

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

export const autoConfirmLog = () => invoke<AutoConfirmLog>('auto_confirm_log')
