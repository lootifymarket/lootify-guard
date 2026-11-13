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
