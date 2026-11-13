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

/** What came of accepting: done, confirmed in Guard here, or waiting for email. */
export type Accepted = 'done' | 'confirmed' | 'needsEmail'

export const acceptTradeOffer = (offer: TradeOffer) =>
  invoke<Accepted>('accept_trade_offer', {
    accountName: offer.accountName,
    offerId: offer.id,
    partnerId: offer.partnerId,
  })

export const declineTradeOffer = (offer: TradeOffer) =>
  invoke<void>('decline_trade_offer', {
    accountName: offer.accountName,
    offerId: offer.id,
  })

export const cancelTradeOffer = (offer: TradeOffer) =>
  invoke<void>('cancel_trade_offer', {
    accountName: offer.accountName,
    offerId: offer.id,
  })

export const confirmTradeOffer = (offer: TradeOffer) =>
  invoke<void>('confirm_trade_offer', {
    accountName: offer.accountName,
    offerId: offer.id,
  })

export type PartnerWarning =
  | { kind: 'newAccount'; days: number }
  | { kind: 'noLevel' }
  | { kind: 'vacBanned' }
  | { kind: 'tradeBanned' }
  | { kind: 'tradeProbation' }
  | { kind: 'privateProfile' }
  | { kind: 'copiesName'; of: string }

export type PartnerCheck = {
  name: string | null
  /** Days since the account was made, when the profile shows it. */
  ageDays: number | null
  level: number | null
  warnings: PartnerWarning[]
}

/** Someone the user already knows by name, whom a scammer may copy. */
export type Known = { id: string; name: string }

export const checkTradePartner = (offer: TradeOffer, known: Known[]) =>
  invoke<PartnerCheck>('check_trade_partner', {
    accountName: offer.accountName,
    partnerId: offer.partnerId,
    known,
  })

export function warningText(warning: PartnerWarning) {
  switch (warning.kind) {
    case 'newAccount':
      return `Account is ${warning.days} ${warning.days === 1 ? 'day' : 'days'} old`
    case 'noLevel':
      return 'Steam level 0'
    case 'vacBanned':
      return 'VAC banned'
    case 'tradeBanned':
      return 'Trade banned'
    case 'tradeProbation':
      return 'On trade probation'
    case 'privateProfile':
      return 'Private profile'
    case 'copiesName':
      return `Copies the name of ${warning.of}`
  }
}

export type Game = 'cs2' | 'dota2'

export const GAME_NAMES: Record<Game, string> = {
  cs2: 'Counter-Strike 2',
  dota2: 'Dota 2',
}

export type InventoryItem = {
  appId: number
  contextId: string
  assetId: string
  name: string
  color: string | null
  amount: number
}

/** Items that can be traded now; `held` counts the ones under a trade hold. */
export type Tradable = { items: InventoryItem[]; held: number }

export const tradableItems = (accountName: string, game: Game) =>
  invoke<Tradable>('tradable_items', { accountName, game })

export type Sent = { offerId: string; accepted: Accepted }

/** Sends the items, asking nothing back, and confirms the offer in Guard. */
export const sendTradeOffer = (
  accountName: string,
  tradeUrl: string,
  items: InventoryItem[],
  message: string,
) =>
  invoke<Sent>('send_trade_offer', {
    accountName,
    tradeUrl,
    assets: items.map(({ appId, contextId, assetId, amount }) => ({
      appId,
      contextId,
      assetId,
      amount,
    })),
    message,
  })
