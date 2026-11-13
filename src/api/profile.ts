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
