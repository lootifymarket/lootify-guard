import { invoke } from '@tauri-apps/api/core'
import type { Language } from '../i18n/index.ts'

/** The auto-lock choices, in minutes. */
export const AUTO_LOCK_CHOICES = [5, 15, 60] as const

export type Settings = {
  /** `null` never locks. */
  autoLockMinutes: number | null
  /** When the last backup was saved, in Unix seconds. */
  lastBackupAt: number | null
  /** Blurs codes, Steam IDs, trade URLs and money. */
  streamerMode: boolean
  /** Closing the window leaves the app running in the tray. */
  closeToTray: boolean
  language: Language
}

export const getSettings = () => invoke<Settings>('get_settings')

/** Takes effect at once, counting from the last activity. */
export const setAutoLock = (minutes: number | null) =>
  invoke<void>('set_auto_lock', { minutes })

export const setStreamerMode = (on: boolean) =>
  invoke<void>('set_streamer_mode', { on })

export const saveLanguage = (language: Language) =>
  invoke<void>('set_language', { language })

export const setCloseToTray = (on: boolean) =>
  invoke<void>('set_close_to_tray', { on })

/** Whether the system starts the app at login, as the system has it. */
export const launchAtStartup = () => invoke<boolean>('launch_at_startup')

export const setLaunchAtStartup = (on: boolean) =>
  invoke<void>('set_launch_at_startup', { on })

/** Blurs whatever is marked `data-private` on the page. */
export function showStreamerMode(on: boolean) {
  if (on) document.documentElement.dataset.streamer = ''
  else delete document.documentElement.dataset.streamer
}

/** Opens a save dialog; resolves to false when no place was picked. */
export const exportBackup = () => invoke<boolean>('export_backup')
