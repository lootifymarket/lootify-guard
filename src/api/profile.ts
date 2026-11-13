import { invoke } from '@tauri-apps/api/core'

export type Wallet = {
  /** ISO 4217, or `null` for a currency the app doesn't know. */
  currency: string | null
  /** In hundredths of the currency. */
  balance: number
  /** Money that arrives once a market sale or a deposit clears. */
  pending: number
}

export const tradeUrl = (accountName: string) =>
  invoke<string>('trade_url', { accountName })

/** The old URL stops working, and offers sent to it are lost. */
export const newTradeUrl = (accountName: string) =>
  invoke<string>('new_trade_url', { accountName })

/** Resolves to `null` when the account has no Steam wallet yet. */
export const walletBalance = (accountName: string) =>
  invoke<Wallet | null>('wallet_balance', { accountName })

export function formatMoney(cents: number, currency: string | null) {
  const amount = cents / 100
  if (!currency) return amount.toFixed(2)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount)
}

export type Visibility = 'private' | 'friendsOnly' | 'public'

export const VISIBILITY_NAMES: Record<Visibility, string> = {
  public: 'Public',
  friendsOnly: 'Friends only',
  private: 'Private',
}

export type Privacy = {
  profile: Visibility
  inventory: Visibility
  games: Visibility
}

export type ProfileSettings = {
  personaName: string
  /** The part after steamcommunity.com/id/, empty when there is none. */
  customUrl: string
  summary: string
  privacy: Privacy
  /** Newest first, or `null` when Steam's list couldn't be read. */
  pastNames: PastName[] | null
}

export type PastName = {
  name: string
  /** As Steam words it, like "14 Jul @ 10:02am". */
  changed: string
}

/** Only what's set is changed; the rest stays as Steam has it. */
export type ProfileChanges = Partial<Omit<ProfileSettings, 'pastNames'>>

export const profileSettings = (accountName: string) =>
  invoke<ProfileSettings>('profile_settings', { accountName })

export const saveProfile = (accountName: string, changes: ProfileChanges) =>
  invoke<void>('save_profile', { accountName, changes })

export const clearNameHistory = (accountName: string) =>
  invoke<void>('clear_name_history', { accountName })
