import { invoke } from '@tauri-apps/api/core'

export type Release = {
  version: string
  /** What the release says is new, as written for it. */
  notes: string | null
  /** Unix seconds. */
  date: number | null
}

export type UpdateStatus =
  | { state: 'notChecked' }
  | { state: 'upToDate'; checkedAt: number }
  | { state: 'checking' }
  | { state: 'available'; release: Release }
  | {
      state: 'downloading'
      release: Release
      downloaded: number
      total: number | null
    }
  /** Downloaded; installs on the next restart. */
  | { state: 'ready'; release: Release }
  /** `release` is `null` when the check itself failed. */
  | { state: 'failed'; release: Release | null }

export const updateStatus = () => invoke<UpdateStatus>('update_status')

/** Checks now; downloads what it finds when updates install themselves. */
export const checkForUpdates = () => invoke<UpdateStatus>('check_for_updates')

/** Starts the download; `updateStatus` follows it. */
export const downloadUpdate = () => invoke<void>('download_update')

/** Installs the downloaded update and opens the new version. */
export const installUpdate = () => invoke<void>('install_update')

export const setAutoUpdate = (on: boolean) =>
  invoke<void>('set_auto_update', { on })

/** Forgets the update that was installed, once the new version has said so. */
export const dismissInstalledUpdate = () =>
  invoke<void>('dismiss_installed_update')

/**
 * The points of release notes: their list items when there are any, else
 * their paragraphs. Headings and other markdown are left out.
 */
export function releasePoints(notes: string | null): string[] {
  const lines = (notes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const items = lines
    .filter((line) => /^[-*] /.test(line))
    .map((line) => line.slice(2))
  return (items.length > 0 ? items : lines).map((line) =>
    line.replace(/\*\*|`/g, ''),
  )
}
