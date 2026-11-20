import { invoke } from '@tauri-apps/api/core'
import type { GuardStart } from './addAccount.ts'

/**
 * `sms`: Steam moves Guard here with an SMS to the account's phone.
 * `revocationCode`: the code takes the old Guard off, then a new one is added.
 */
export type ReplaceMethod = 'sms' | 'revocationCode'

/** `guardOn` is false when Steam shows no authenticator on the account. */
export type Begun = { guardOn: boolean }

/** `guardOn` is false when Steam took the code but didn't turn the new one on. */
export type Replaced = { revocationCode: string | null; guardOn: boolean }

/** `password` is `null` when the user picked biometrics. */
export const replaceGuardBegin = (
  accountName: string,
  password: string | null,
) => invoke<Begun>('replace_guard_begin', { accountName, password })

/** `revocationCode` is one the user typed, for when the vault has none. */
export const replaceGuardStart = (
  method: ReplaceMethod,
  revocationCode: string | null = null,
) => invoke<GuardStart>('replace_guard_start', { method, revocationCode })

/** Saves the new secrets over the old ones once Steam accepts the code. */
export const replaceGuardConfirm = (code: string) =>
  invoke<Replaced>('replace_guard_confirm', { code })

export const replaceGuardCancel = () => invoke<void>('replace_guard_cancel')
