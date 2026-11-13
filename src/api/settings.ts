import { invoke } from '@tauri-apps/api/core'

/** The auto-lock choices, in minutes. */
export const AUTO_LOCK_CHOICES = [5, 15, 60] as const

export type Settings = {
  /** `null` never locks. */
  autoLockMinutes: number | null
  /** When the last backup was saved, in Unix seconds. */
  lastBackupAt: number | null
}

export const getSettings = () => invoke<Settings>('get_settings')

/** Takes effect at once, counting from the last activity. */
export const setAutoLock = (minutes: number | null) =>
  invoke<void>('set_auto_lock', { minutes })

/** Opens a save dialog; resolves to false when no place was picked. */
export const exportBackup = () => invoke<boolean>('export_backup')
