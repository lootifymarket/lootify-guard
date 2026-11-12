import { invoke } from '@tauri-apps/api/core'

export const CODE_PERIOD_SECS = 30

export type Account = {
  steamId: string | null
  accountName: string
  code: string
  deviceId: string | null
  hasRevocationCode: boolean
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
