import { invoke } from '@tauri-apps/api/core'

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
  /** What Steam calls it, like "Classified Rifle". */
  kind: string
  /** Steam's name for the picture, to ask `itemIcons` for. */
  icon: string | null
  /** Steam's hex color for the name, which marks StatTrak and the like. */
  color: string | null
  /** Steam's hex color for the rarity, without the `#`. */
  rarityColor: string | null
  /** Like "Classified" or "Base Grade". */
  rarity: string | null
  /** Like "Minimal Wear", for weapons and gloves. */
  exterior: string | null
  /** Like "M4A4", for weapons. */
  weapon: string | null
  amount: number
  /** Can go into a trade now; false under a trade hold or for good. */
  tradable: boolean
  /** Can be listed on the Steam market now. */
  marketable: boolean
}

/** Pictures by Steam's name for them, as data URLs; failed ones are left out. */
export const itemIcons = (accountName: string, icons: string[]) =>
  invoke<Record<string, string>>('item_icons', { accountName, icons })

/** Everything in the account's inventory for the game, sorted by name. */
export const inventoryItems = (accountName: string, game: Game) =>
  invoke<InventoryItem[]>('inventory_items', { accountName, game })

export type MoveReport = {
  accountName: string
  count: number
} & (
  | { outcome: 'done' }
  /** Sent and confirmed, but the target couldn't take it yet. */
  | { outcome: 'sent'; reason: string }
  | { outcome: 'failed'; reason: string }
)

/** Moves each account's items to `target`, one account after another. */
export const moveItems = (
  target: string,
  groups: { accountName: string; items: InventoryItem[] }[],
) =>
  invoke<MoveReport[]>('move_items', {
    target,
    groups: groups.map(({ accountName, items }) => ({
      accountName,
      assets: items.map(({ appId, contextId, assetId, amount }) => ({
        appId,
        contextId,
        assetId,
        amount,
      })),
    })),
  })

export type Price = {
  /** As the buyer pays, in hundredths of the wallet currency. */
  lowest: number | null
  median: number | null
}

export type Prices = {
  /** ISO 4217, or `null` when the wallet's currency isn't one the app knows. */
  currency: string | null
  /** By market name; names Steam had no price for are left out. */
  prices: Record<string, Price>
}

/** Market prices, in the account's wallet currency, for up to 20 names. */
export const marketPrices = (
  accountName: string,
  game: Game,
  names: string[],
) => invoke<Prices>('market_prices', { accountName, game, names })

export type ListingReport = {
  accountName: string
  assetId: string
} & (
  | { outcome: 'done' }
  /** Listed, but its confirmation wasn't found; it's on the Steam Guard screen. */
  | { outcome: 'unconfirmed' }
  | { outcome: 'needsEmail' }
  | { outcome: 'failed'; reason: string }
)

/** Lists items at what the buyer pays, in `currency`, and confirms them in Guard. */
export const listOnMarket = (
  currency: string,
  groups: {
    accountName: string
    listings: { item: InventoryItem; price: number }[]
  }[],
) =>
  invoke<ListingReport[]>('list_on_market', {
    currency,
    groups: groups.map(({ accountName, listings }) => ({
      accountName,
      listings: listings.map(({ item, price }) => ({
        appId: item.appId,
        contextId: item.contextId,
        assetId: item.assetId,
        amount: item.amount,
        name: item.name,
        price,
      })),
    })),
  })

// Steam's cut and the game's, as in `market.rs`; only for showing an estimate.
const STEAM_FEE = 0.05
const GAME_FEE = 0.1

/** About what the seller gets when the buyer pays `price`, in hundredths. */
export function sellerGets(price: number) {
  const pays = (receive: number) =>
    receive +
    Math.max(Math.floor(receive * STEAM_FEE), 1) +
    Math.max(Math.floor(receive * GAME_FEE), 1)
  let receive = Math.floor(price / (1 + STEAM_FEE + GAME_FEE)) + 2
  while (receive > 0 && pays(receive) > price) receive -= 1
  return receive
}
