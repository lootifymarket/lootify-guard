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

export type DeviceKind = 'steamClient' | 'browser' | 'mobileApp' | 'unknown'

export const DEVICE_KIND_NAMES: Record<DeviceKind, string> = {
  steamClient: 'Steam client',
  browser: 'Browser',
  mobileApp: 'Mobile app',
  unknown: 'Device',
}

export type Device = {
  name: string
  kind: DeviceKind
  /** The session this app itself uses. */
  thisApp: boolean
  lastSeenAt: number | null
  /** City and country Steam guesses from the last IP. */
  place: string | null
}

/** This app first, then the most recently seen. */
export const listDevices = (accountName: string) =>
  invoke<Device[]>('list_devices', { accountName })

/** Resolves to how many devices were signed out. */
export const signOutOtherDevices = (accountName: string) =>
  invoke<number>('sign_out_other_devices', { accountName })
