import { invoke } from '@tauri-apps/api/core'

export const CODE_PERIOD_SECS = 30

export type Account = {
  steamId: string | null
  accountName: string
  code: string
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
