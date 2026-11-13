import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import { words } from '../i18n/index.ts'
import type { InventoryItem } from './inventory.ts'

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

export const offerStateName = (state: OfferState) =>
  words().trades.states[state]

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

export const listTradeOffers = () =>
  invoke<Trades>('list_trade_offers').then((trades) => ({
    ...trades,
    failures: trades.failures.map((failure) => ({
      ...failure,
      reason: fromBackend(failure.reason),
    })),
  }))

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
  const t = words().trades.warnings
  switch (warning.kind) {
    case 'newAccount':
      return t.newAccount(warning.days)
    case 'noLevel':
      return t.noLevel
    case 'vacBanned':
      return t.vacBanned
    case 'tradeBanned':
      return t.tradeBanned
    case 'tradeProbation':
      return t.tradeProbation
    case 'privateProfile':
      return t.privateProfile
    case 'copiesName':
      return t.copiesName(warning.of)
  }
}

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
