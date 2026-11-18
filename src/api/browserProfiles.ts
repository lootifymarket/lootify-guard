import { invoke } from '@tauri-apps/api/core'
import type { RegionChoice } from './browser.ts'

/** A browser tab signed in to no Steam account that keeps its sign-ins. */
export type BrowserProfile = {
  id: number
  name: string
  /** `null` goes out without a proxy. */
  proxyId: number | null
  /** How many sites it keeps sign-ins for. */
  savedSites: number
  /** Unix seconds. */
  lastOpened: number | null
  region: RegionChoice
}

export const listBrowserProfiles = () =>
  invoke<BrowserProfile[]>('list_browser_profiles')

/** Resolves to the new profile's id. */
export const addBrowserProfile = (
  name: string,
  proxyId: number | null,
  region: RegionChoice,
) => invoke<number>('add_browser_profile', { name, proxyId, region })

/** A new proxy or region takes effect the next time the profile's tab opens. */
export const updateBrowserProfile = (
  id: number,
  name: string,
  proxyId: number | null,
  region: RegionChoice,
) => invoke<void>('update_browser_profile', { id, name, proxyId, region })

/** Removes the profile and its sign-ins, closing its tab. */
export const removeBrowserProfile = (id: number) =>
  invoke<void>('remove_browser_profile', { id })

/**
 * Opens the profile's tab, hidden until placed, with its sign-ins back. Resolves
 * to the tab's name.
 */
export const openProfileBrowser = (profileId: number) =>
  invoke<string>('open_profile_browser', { profileId })

export const profileTab = (id: number) => `profile:${id}`

/** The profile a tab belongs to, or `null` for any other tab. */
export const profileOfTab = (tab: string) =>
  tab.startsWith('profile:') ? Number(tab.slice('profile:'.length)) : null

// Dark enough under white letters, apart from each other and from the accent.
const TINTS = ['#3a1f22', '#1f2a3a', '#23331f', '#33291a', '#2b1f3a', '#1f3333']

/** The colour of a profile's mark, the same wherever it shows. */
export const profileTint = (id: number) => TINTS[id % TINTS.length]
