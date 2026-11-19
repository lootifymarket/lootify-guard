import { invoke } from '@tauri-apps/api/core'
import { words } from '../i18n/index.ts'

export type ApiKey = {
  domain: string
  /** The user said this very key is theirs. */
  trusted: boolean
}

/**
 * `here`: Steam has the Guard from the vault. `elsewhere`: Steam has another one,
 * so the codes here don't work. `off`: the account has no Steam Guard at all.
 */
export type GuardStatus = 'here' | 'elsewhere' | 'off'

export const checkGuard = (accountName: string) =>
  invoke<GuardStatus>('check_guard', { accountName })

/** Resolves to `null` when the account has no Web API key. */
export const checkApiKey = (accountName: string) =>
  invoke<ApiKey | null>('check_api_key', { accountName })

export const trustApiKey = (accountName: string) =>
  invoke<void>('trust_api_key', { accountName })

export const revokeApiKey = (accountName: string) =>
  invoke<void>('revoke_api_key', { accountName })

export type DeviceKind = 'steamClient' | 'browser' | 'mobileApp' | 'unknown'

// Getters, so each read is in the language picked at that moment.
export const DEVICE_KIND_NAMES: Record<DeviceKind, string> = {
  get steamClient() {
    return words().account.device.kinds.steamClient
  },
  get browser() {
    return words().account.device.kinds.browser
  },
  get mobileApp() {
    return words().account.device.kinds.mobileApp
  },
  get unknown() {
    return words().account.device.kinds.unknown
  },
}

export type Device = {
  /** Steam's id for the device's session. */
  id: string
  name: string
  kind: DeviceKind
  /** The session this app itself uses. */
  thisApp: boolean
  lastSeenAt: number | null
  /** City and country Steam guesses from the last IP. */
  place: string | null
  /** The name the user gave it in this app. */
  label: string | null
}

/** This app first, then the most recently seen. */
export const listDevices = (accountName: string) =>
  invoke<Device[]>('list_devices', { accountName })

/** Resolves to how many devices were signed out. */
export const signOutOtherDevices = (accountName: string) =>
  invoke<number>('sign_out_other_devices', { accountName })

export type TradeBan = 'none' | 'probation' | 'banned'

export type Bans = {
  vacBanned: boolean
  /** The counts are `null` when they came from the profile, not the Web API. */
  vacBans: number | null
  gameBans: number | null
  daysSinceLast: number | null
  communityBanned: boolean | null
  tradeBan: TradeBan
}

export type Market = {
  allowed: boolean
  /** When a temporary restriction ends, as Unix time. */
  allowedAt: number | null
}

/** Each part is `null` when Steam didn't say. */
export type Standing = {
  bans: Bans | null
  limited: boolean | null
  market: Market | null
}

export const checkStanding = (accountName: string) =>
  invoke<Standing>('check_standing', { accountName })

export const signOutDevice = (accountName: string, deviceId: string) =>
  invoke<void>('sign_out_device', { accountName, deviceId })

/** An empty name removes the one given before. */
export const nameDevice = (
  accountName: string,
  deviceId: string,
  name: string,
) => invoke<void>('name_device', { accountName, deviceId, name })
