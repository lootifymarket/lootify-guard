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

/** Signs the tab in on first use, then shows it at `bounds` and hides the others. */
export const openBrowser = (accountName: string, bounds: Bounds) =>
  invoke<void>('open_browser', { accountName, bounds })

export const placeBrowser = (accountName: string, bounds: Bounds) =>
  invoke<void>('place_browser', { accountName, bounds })

export const hideBrowser = (accountName: string) =>
  invoke<void>('hide_browser', { accountName })

/** Ends the tab's session; its cookies are gone with it. */
export const closeBrowser = (accountName: string) =>
  invoke<void>('close_browser', { accountName })

/** Opens what was typed into the address bar; fails when it isn't a web address. */
export const browserNavigate = (accountName: string, address: string) =>
  invoke<void>('browser_navigate', { accountName, address })

/**
 * The page as a data URL, to show in its place while the app draws over it, or
 * `null` where none can be taken.
 */
export const browserSnapshot = (accountName: string) =>
  invoke<ArrayBuffer>('browser_snapshot', { accountName }).then((bytes) =>
    bytes.byteLength === 0
      ? null
      : new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(new Blob([bytes], { type: 'image/jpeg' }))
        }),
  )

export const browserBack = (accountName: string) =>
  invoke<void>('browser_back', { accountName })

export const browserForward = (accountName: string) =>
  invoke<void>('browser_forward', { accountName })

export const browserReload = (accountName: string) =>
  invoke<void>('browser_reload', { accountName })

/** `null` once the tab is closed. */
export const browserState = (accountName: string) =>
  invoke<BrowserState | null>('browser_state', { accountName })

/** A page saved to the bar under the address, the same for every account. */
export type Bookmark = {
  url: string
  title: string
  /** The site's icon as a data URL, when it had one to give. */
  icon: string | null
}

export const listBookmarks = () => invoke<Bookmark[]>('list_bookmarks')

/**
 * Saves the page the account's tab is on, fetching its site's icon. Resolves to
 * every bookmark.
 */
export const bookmarkPage = (accountName: string) =>
  invoke<Bookmark[]>('bookmark_page', { accountName })

/** Resolves to every bookmark left. */
export const removeBookmark = (url: string) =>
  invoke<Bookmark[]>('remove_bookmark', { url })
