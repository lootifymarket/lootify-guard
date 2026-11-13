import { invoke } from '@tauri-apps/api/core'

export type OfferState =
  | 'active'
  | 'needsConfirmation'
  | 'accepted'
  | 'onHold'
  | 'countered'
  | 'expired'
  | 'canceled'
  | 'declined'
  | 'invalidItems'
  | 'invalid'

export const OFFER_STATE_NAMES: Record<OfferState, string> = {
  active: 'Waiting',
  needsConfirmation: 'Waiting for confirmation in Guard',
  accepted: 'Accepted',
  onHold: 'Accepted, items on hold',
  countered: 'Countered',
  expired: 'Expired',
  canceled: 'Canceled',
  declined: 'Declined',
  invalidItems: 'Items are gone',
  invalid: 'Invalid',
}

export const isOpen = (state: OfferState) =>
  state === 'active' || state === 'needsConfirmation'

export type Item = {
  name: string
  /** Steam's hex color for the item's rarity, without the `#`. */
  color: string | null
  amount: number
}

export type TradeOffer = {
  accountName: string
  id: string
  /** SteamID64 of the other side. */
  partnerId: string
  partnerName: string | null
  /** The other side is an account in this vault, by its login. */
  partnerAccount: string | null
  sent: boolean
  state: OfferState
  message: string
  give: Item[]
  get: Item[]
  createdAt: number
  expiresAt: number
  /** When held items arrive, for offers on hold. */
  heldUntil: number | null
}

export type Trades = {
  /** Newest first, across every account. */
  offers: TradeOffer[]
  failures: { accountName: string; reason: string }[]
  /** Accounts not signed in to Steam, so they have no list. */
  signedOut: string[]
}

export const listTradeOffers = () => invoke<Trades>('list_trade_offers')
