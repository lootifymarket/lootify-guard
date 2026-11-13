import { invoke } from '@tauri-apps/api/core'

/** Steam plays at most this many at once; a status counts as one. */
export const MAX_GAMES = 32

/** How the account shows to friends while connected. */
export type Presence = 'online' | 'away' | 'busy' | 'invisible'

export const PRESENCE_NAMES: Record<Presence, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Do not disturb',
  invisible: 'Invisible',
}

export type PlayingList = {
  games: number[]
  /** Shown on the profile instead of a game's name. */
  status: string | null
  presence: Presence
}

export type OwnedGame = {
  appId: number
  name: string
  /** Playtime in all, in minutes. */
  minutes: number
}

export type PlayState =
  | { state: 'connecting' }
  /** `since` is in Unix seconds. */
  | { state: 'playing'; since: number }
  /** Another device is playing on the account, so these games don't count. */
  | { state: 'blocked' }
  /** Tried again at `at`, in Unix seconds. */
  | { state: 'reconnecting'; reason: string; at: number }
  | { state: 'stopped'; reason: string }

export type Player = { accountName: string } & PlayingList & PlayState

/** Every account with a game connection, playing or trying to. */
export const playingNow = () => invoke<Player[]>('playing_now')

/** What the account plays when started, as saved with it. */
export const playingList = (accountName: string) =>
  invoke<PlayingList>('playing_list', { accountName })

/** Saves the list with the account and plays it, connecting when needed. */
export const startPlaying = (accountName: string, list: PlayingList) =>
  invoke<void>('start_playing', { accountName, list })

export const stopPlaying = (accountName: string) =>
  invoke<void>('stop_playing', { accountName })

/** Most played first. */
export const ownedGames = (accountName: string) =>
  invoke<OwnedGame[]>('owned_games', { accountName })

export type CardGame = {
  appId: number
  name: string
  drops: number
  hours: number
}

export type Farm = { accountName: string } & (
  | { state: 'checking' }
  | {
      state: 'farming'
      /** Games with drops left. */
      games: CardGame[]
      /** The ones being played now. */
      playing: number[]
      /** In Unix seconds. */
      nextCheck: number
      /** Why the last check failed; farming goes on meanwhile. */
      problem: string | null
    }
  /** Every card has dropped. */
  | { state: 'done' }
  | { state: 'stopped'; reason: string }
)

/** Plays the games with card drops left until they run out. */
export const startFarming = (accountName: string) =>
  invoke<void>('start_farming', { accountName })

export const farmingNow = () => invoke<Farm[]>('farming_now')
