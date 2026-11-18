import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import type { AutoConfirm } from './autoConfirm.ts'

export const CODE_PERIOD_SECS = 30

export type Account = {
  steamId: string | null
  accountName: string
  code: string
  deviceId: string | null
  hasRevocationCode: boolean
  signedIn: boolean
  personaName: string | null
  /** A data URL, or null before the profile was fetched. */
  avatar: string | null
  proxyId: number | null
  groupId: number | null
  autoConfirm: AutoConfirm
  /** Whether the account has a game connection up or coming up. */
  playing: boolean
  /** What the user wrote about it; never sent to Steam. */
  note: string | null
  /** As Steam last showed it. */
  wallet: StoredWallet | null
  lastCheck: LastCheck | null
}

export type StoredWallet = {
  /** ISO 4217, or `null` for a currency the app doesn't know. */
  currency: string | null
  /** In hundredths of the currency. */
  balance: number
  pending: number
  /** When it was read, in Unix seconds. */
  at: number
}

export type LastCheck = {
  /** Unix seconds. */
  at: number
  /** In the backend's English; empty when all was clear. */
  problems: string[]
}

export type Group = {
  id: number
  name: string
  /** How many accounts are in it. */
  count: number
}

export type AccountList = {
  codesExpireAt: number
  accounts: Account[]
  /** In the order they were made. */
  groups: Group[]
}

export type ImportReport = {
  added: string[]
  alreadyAdded: string[]
  failed: { file: string; reason: string }[]
}

export const listAccounts = () => invoke<AccountList>('list_accounts')

/** Resolves to `null` when the file picker is closed without choosing anything. */
export const importMaFiles = () =>
  invoke<ImportReport | null>('import_mafiles').then(
    (report) =>
      report && {
        ...report,
        failed: report.failed.map((failure) => ({
          ...failure,
          reason: fromBackend(failure.reason),
        })),
      },
  )

/** Without a password, the backend asks for biometrics instead. */
export const revealRevocationCode = (
  accountName: string,
  password: string | null,
) => invoke<string>('reveal_revocation_code', { accountName, password })

/** Resolves to the saved file's name, or `null` when saving was cancelled. */
export const exportMaFile = (accountName: string, password: string | null) =>
  invoke<string | null>('export_mafile', { accountName, password })

/**
 * Saves a folder with the account's `.maFile` and `account_details.json`.
 * Resolves to the folder's name, or `null` when saving was cancelled.
 */
export const exportAccount = (accountName: string, password: string | null) =>
  invoke<string | null>('export_account', { accountName, password })

export const removeAccount = (accountName: string) =>
  invoke<void>('remove_account', { accountName })

/** Signs in to Steam. The password is kept in the vault only if asked to. */
export const signIn = (
  accountName: string,
  password: string,
  rememberPassword: boolean,
) => invoke<void>('sign_in', { accountName, password, rememberPassword })

/** Checks the Steam session and updates the nickname and avatar. */
export const refreshProfile = (accountName: string) =>
  invoke<void>('refresh_profile', { accountName })

/** The nickname first when Steam gave one, then the login and Steam ID. */
export function describe(account: Account) {
  const title = account.personaName || account.accountName
  const details = [
    account.personaName ? account.accountName : null,
    account.steamId,
  ].filter(Boolean)
  return { title, details: details.join(' · ') }
}

/** An empty note removes it. */
export const setAccountNote = (accountName: string, note: string) =>
  invoke<void>('set_account_note', { accountName, note })

export const setAccountProxy = (accountName: string, proxyId: number | null) =>
  invoke<void>('set_account_proxy', { accountName, proxyId })
