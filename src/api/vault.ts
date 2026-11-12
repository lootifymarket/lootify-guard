import { invoke } from '@tauri-apps/api/core'

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

export const lockVault = () => invoke<void>('lock_vault')

export const eraseVault = () => invoke<void>('erase_vault')

function errorKind(error: unknown) {
  return (error as CommandError | undefined)?.kind
}

export const isWrongPassword = (error: unknown) =>
  errorKind(error) === 'wrongPassword'

export const isCancelled = (error: unknown) => errorKind(error) === 'cancelled'

export const isBiometricsOutdated = (error: unknown) =>
  errorKind(error) === 'biometricsOutdated'

export function errorMessage(error: unknown) {
  const commandError = error as CommandError | undefined
  switch (commandError?.kind) {
    case 'failed':
      return commandError.message
    case 'wrongPassword':
      return 'Wrong password'
    case 'locked':
      return 'The vault is locked'
    case 'biometricsOutdated':
      return 'Biometric unlock no longer matches this vault. Use your password.'
    case 'cancelled':
      return 'Cancelled'
    default:
      return String(error)
  }
}
