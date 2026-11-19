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

/** One point of release notes; `lead` is its bold opening, like a short title. */
export type ReleasePoint = { lead: string | null; text: string }

/** A part of release notes under its heading, or `null` before any heading. */
export type ReleaseSection = { title: string | null; points: ReleasePoint[] }

/**
 * Release notes as their headed parts. Each part's points are its list items
 * when it has any, else its paragraphs. Other markdown is left out.
 */
export function releaseSections(notes: string | null): ReleaseSection[] {
  const parts: { title: string | null; lines: string[] }[] = []
  for (const raw of (notes ?? '').split('\n')) {
    const line = raw.trim()
    const heading = /^#+\s+(.*)$/.exec(line)
    if (heading) parts.push({ title: plain(heading[1]), lines: [] })
    // The attribution line under every release isn't news.
    else if (line && !line.startsWith('🤖')) {
      if (parts.length === 0) parts.push({ title: null, lines: [] })
      parts[parts.length - 1].lines.push(line)
    }
  }
  return parts
    .map(({ title, lines }) => {
      const items = lines
        .filter((line) => /^[-*] /.test(line))
        .map((line) => line.slice(2))
      return {
        title,
        points: (items.length > 0 ? items : lines).map(point),
      }
    })
    .filter((section) => section.points.length > 0)
}

function point(line: string): ReleasePoint {
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(line)
  return bold
    ? { lead: plain(bold[1]), text: plain(bold[2]) }
    : { lead: null, text: plain(line) }
}

/** Drops emphasis and code marks, and keeps only the text of links. */
function plain(text: string) {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|`/g, '')
}
