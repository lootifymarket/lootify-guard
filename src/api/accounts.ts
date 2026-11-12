import { invoke } from '@tauri-apps/api/core'

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
}

export type AccountList = {
  codesExpireAt: number
  accounts: Account[]
}

export type ImportReport = {
  added: string[]
  alreadyAdded: string[]
  failed: { file: string; reason: string }[]
}

export const listAccounts = () => invoke<AccountList>('list_accounts')

/** Resolves to `null` when the file picker is closed without choosing anything. */
export const importMaFiles = () => invoke<ImportReport | null>('import_mafiles')

/** Without a password, the backend asks for biometrics instead. */
export const revealRevocationCode = (
  accountName: string,
  password: string | null,
) => invoke<string>('reveal_revocation_code', { accountName, password })

/** Resolves to the saved file's name, or `null` when saving was cancelled. */
export const exportMaFile = (accountName: string, password: string | null) =>
  invoke<string | null>('export_mafile', { accountName, password })

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

export const setAccountProxy = (accountName: string, proxyId: number | null) =>
  invoke<void>('set_account_proxy', { accountName, proxyId })
