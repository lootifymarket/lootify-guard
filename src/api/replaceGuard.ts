import { invoke } from '@tauri-apps/api/core'
import type { ConfirmBy } from './addAccount.ts'

/**
 * `sms`: Steam moves Guard here with an SMS to the account's phone.
 * `revocationCode`: the code takes the old Guard off, then a new one is added.
 */
export type ReplaceMethod = 'sms' | 'revocationCode'

export type Replaced = { revocationCode: string | null }

/** `password` is `null` when the user picked biometrics. */
export const replaceGuardBegin = (
  accountName: string,
  password: string | null,
) => invoke<void>('replace_guard_begin', { accountName, password })

export const replaceGuardStart = (method: ReplaceMethod) =>
  invoke<ConfirmBy>('replace_guard_start', { method })

/** Saves the new secrets over the old ones once Steam accepts the code. */
export const replaceGuardConfirm = (code: string) =>
  invoke<Replaced>('replace_guard_confirm', { code })

export const replaceGuardCancel = () => invoke<void>('replace_guard_cancel')
