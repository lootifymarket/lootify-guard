import { invoke } from '@tauri-apps/api/core'

/** Where the code Steam asks for at sign-in comes from. */
export type SignInCode = 'email' | 'phone'

export type Next =
  | { step: 'code'; from: SignInCode }
  /** Signed in. `onPhone`: Steam Guard is already on a phone, so a new one can't be added. */
  | { step: 'guard'; onPhone: boolean }

export type GuardMethod = 'new' | 'move' | 'revocationCode'

export type ConfirmBy =
  { by: 'sms'; phoneHint: string | null } | { by: 'email' }

export type GuardStart =
  | { outcome: 'sent'; confirmBy: ConfirmBy }
  /** Moving is confirmed by SMS, and the account has no phone number. */
  | { outcome: 'noPhone' }

export type NewAccount = {
  accountName: string
  revocationCode: string | null
}

export const addAccountSignIn = (
  accountName: string,
  password: string,
  proxyId: number | null,
  rememberPassword: boolean,
) =>
  invoke<Next>('add_account_sign_in', {
    accountName,
    password,
    proxyId,
    rememberPassword,
  })

export const addAccountSignInCode = (code: string) =>
  invoke<Next>('add_account_sign_in_code', { code })

/** `revocationCode` is the one shown in the Steam app on the phone. */
export const addAccountGuard = (
  method: GuardMethod,
  revocationCode: string | null = null,
) => invoke<GuardStart>('add_account_guard', { method, revocationCode })

/**
 * Adds the account with Guard from its .maFile. Resolves to the account's name,
 * or `null` when picking was cancelled.
 */
export const addAccountImportMaFile = () =>
  invoke<string | null>('add_account_import_mafile')

/** Saves the account to the vault once Steam accepts the code. */
export const addAccountConfirm = (code: string) =>
  invoke<NewAccount>('add_account_confirm', { code })

/** Resolves to the saved file's name, or `null` when saving was cancelled. */
export const saveNewRevocationCode = () =>
  invoke<string | null>('save_new_revocation_code')

export const addAccountCancel = () => invoke<void>('add_account_cancel')
