import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'
import { words } from '../i18n/index.ts'

/** Steam plays at most this many at once; a status counts as one. */
export const MAX_GAMES = 32

/** How the account shows to friends while connected. */
export type Presence = 'online' | 'away' | 'busy' | 'invisible'

// Getters, so each read is in the language picked at that moment.
export const PRESENCE_NAMES: Record<Presence, string> = {
  get online() {
    return words().account.playing.presences.online
  },
  get away() {
    return words().account.playing.presences.away
  },
  get busy() {
    return words().account.playing.presences.busy
  },
  get invisible() {
    return words().account.playing.presences.invisible
  },
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

/** How the last request to add free games went. */
export type FreeGamesAsked = {
  asked: number[]
  /** `null` when Steam didn't answer in time. */
  answer: {
    /** Steam's EResult: 1 is OK. */
    result: number
    /** Added now; ones the account had already aren't among them. */
    granted: number[]
  } | null
}

export type Player = {
  accountName: string
  freeGames?: FreeGamesAsked
} & PlayingList &
  PlayState

/** Every account with a game connection, playing or trying to. */
export const playingNow = () =>
  invoke<Player[]>('playing_now').then((players) =>
    players.map((player) =>
      player.state === 'reconnecting' || player.state === 'stopped'
        ? { ...player, reason: fromBackend(player.reason) }
        : player,
    ),
  )

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

/** A free game any account can play; Steam adds it when it's first played. */
export type FreeGame = {
  appId: number
  name: string
}

let free: Promise<FreeGame[]> | null = null

/** The free games the app knows. They never change, so they're asked for once. */
export const freeGames = () => (free ??= invoke<FreeGame[]>('free_games'))

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

export const farmingNow = () =>
  invoke<Farm[]>('farming_now').then((farms) =>
    farms.map((farm) => {
      if (farm.state === 'stopped') {
        return { ...farm, reason: fromBackend(farm.reason) }
      }
      if (farm.state === 'farming' && farm.problem) {
        return { ...farm, problem: fromBackend(farm.problem) }
      }
      return farm
    }),
  )
