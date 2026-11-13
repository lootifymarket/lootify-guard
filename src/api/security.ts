import { invoke } from '@tauri-apps/api/core'

export type ApiKey = {
  domain: string
  /** The user said this very key is theirs. */
  trusted: boolean
}

/** Resolves to `null` when the account has no Web API key. */
export const checkApiKey = (accountName: string) =>
  invoke<ApiKey | null>('check_api_key', { accountName })

export const trustApiKey = (accountName: string) =>
  invoke<void>('trust_api_key', { accountName })

export const revokeApiKey = (accountName: string) =>
  invoke<void>('revoke_api_key', { accountName })
