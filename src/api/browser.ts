import { invoke } from '@tauri-apps/api/core'

/** Where the page goes in the window, in CSS pixels. */
export type Bounds = { x: number; y: number; width: number; height: number }

export type BrowserState = {
  /** `null` until the first page has loaded. */
  url: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Unix seconds. */
  openedAt: number
}

/**
 * Tabs are named after their account, or `private:1`, `private:2` and on for
 * those signed in to nothing.
 */
export const isPrivateTab = (tab: string) => tab.startsWith('private:')

/** Signs the account's tab in on first use, then shows it at `bounds` and hides the others. */
export const openBrowser = (accountName: string, bounds: Bounds) =>
  invoke<void>('open_browser', { accountName, bounds })

/**
 * Opens a tab signed in to nothing, through the proxy or straight out. It starts
 * hidden until placed. Resolves to the tab's name.
 */
export const openPrivateBrowser = (proxyId: number | null) =>
  invoke<string>('open_private_browser', { proxyId })

export const placeBrowser = (tab: string, bounds: Bounds) =>
  invoke<void>('place_browser', { tab, bounds })

export const hideBrowser = (tab: string) =>
  invoke<void>('hide_browser', { tab })

/** Ends the tab's session; its cookies are gone with it. */
export const closeBrowser = (tab: string) =>
  invoke<void>('close_browser', { tab })

/** Opens what was typed into the address bar; fails when it isn't a web address. */
export const browserNavigate = (tab: string, address: string) =>
  invoke<void>('browser_navigate', { tab, address })

/**
 * The page as a data URL, to show in its place while the app draws over it, or
 * `null` where none can be taken.
 */
export const browserSnapshot = (tab: string) =>
  invoke<ArrayBuffer>('browser_snapshot', { tab }).then((bytes) =>
    bytes.byteLength === 0
      ? null
      : new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(new Blob([bytes], { type: 'image/jpeg' }))
        }),
  )

export const browserBack = (tab: string) =>
  invoke<void>('browser_back', { tab })

export const browserForward = (tab: string) =>
  invoke<void>('browser_forward', { tab })

export const browserReload = (tab: string) =>
  invoke<void>('browser_reload', { tab })

/** `null` once the tab is closed. */
export const browserState = (tab: string) =>
  invoke<BrowserState | null>('browser_state', { tab })

/** A page saved to the bar under the address, the same for every account. */
export type Bookmark = {
  url: string
  title: string
  /** The site's icon as a data URL, when it had one to give. */
  icon: string | null
}

export const listBookmarks = () => invoke<Bookmark[]>('list_bookmarks')

/**
 * Saves the page the tab is on, fetching its site's icon. Resolves to
 * every bookmark.
 */
export const bookmarkPage = (tab: string) =>
  invoke<Bookmark[]>('bookmark_page', { tab })

/**
 * Forgets the sign-ins the tab keeps: an account's, all but Steam's; a profile's
 * (`profile:<id>`), all of them.
 */
export const clearSavedCookies = (tab: string) =>
  invoke<void>('clear_saved_cookies', { tab })

/** Resolves to every bookmark left. */
export const removeBookmark = (url: string) =>
  invoke<Bookmark[]>('remove_bookmark', { url })
