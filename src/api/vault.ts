import { invoke } from '@tauri-apps/api/core'
import { words } from '../i18n/index.ts'

export type VaultStatus = 'missing' | 'locked' | 'unlocked'

export type BiometricMethod = 'touchId'

export type BiometricStatus = {
  method: BiometricMethod | null
  enrolled: boolean
}

export const BIOMETRIC_NAMES: Record<BiometricMethod, string> = {
  touchId: 'Touch ID',
}

type CommandError =
  | { kind: 'wrongPassword' }
  | { kind: 'locked' }
  | { kind: 'cancelled' }
  | { kind: 'biometricsOutdated' }
  | { kind: 'failed'; message: string }

export const vaultStatus = () => invoke<VaultStatus>('vault_status')

export const biometricStatus = () => invoke<BiometricStatus>('biometric_status')

export const createVault = (password: string) =>
  invoke<void>('create_vault', { password })

export const unlockVault = (password: string) =>
  invoke<void>('unlock_vault', { password })

export const unlockWithBiometrics = () => invoke<void>('unlock_with_biometrics')

export const enableBiometrics = () => invoke<void>('enable_biometrics')

export const changePassword = (password: string) =>
  invoke<void>('change_password', { password })

/** Fails with a wrong-password error when `current` isn't the master password. */
export const changeMasterPassword = (current: string, password: string) =>
  invoke<void>('change_master_password', { current, password })

export const disableBiometrics = () => invoke<void>('disable_biometrics')

export const lockVault = () => invoke<void>('lock_vault')

export const eraseVault = () => invoke<void>('erase_vault')

/**
 * Counts as user activity. Resolves to when the vault locks, in Unix seconds,
 * or `null` when it never locks by itself.
 */
export const reportActivity = () => invoke<number | null>('report_activity')

/** When the vault locks, without counting as activity. */
export const autoLockDeadline = () =>
  invoke<number | null>('auto_lock_deadline')

function errorKind(error: unknown) {
  return (error as CommandError | undefined)?.kind
}

export const isWrongPassword = (error: unknown) =>
  errorKind(error) === 'wrongPassword'

export const isCancelled = (error: unknown) => errorKind(error) === 'cancelled'

export const isLocked = (error: unknown) => errorKind(error) === 'locked'

export const isBiometricsOutdated = (error: unknown) =>
  errorKind(error) === 'biometricsOutdated'

export function errorMessage(error: unknown) {
  const commandError = error as CommandError | undefined
  const t = words().errors
  switch (commandError?.kind) {
    case 'failed':
      return commandError.message
    case 'wrongPassword':
      return t.wrongPassword
    case 'locked':
      return t.locked
    case 'biometricsOutdated':
      return t.biometricsOutdated
    case 'cancelled':
      return t.cancelled
    default:
      return String(error)
  }
}
