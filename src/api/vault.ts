import { invoke } from '@tauri-apps/api/core'

export type VaultStatus = 'missing' | 'locked' | 'unlocked'

type CommandError =
  { kind: 'wrongPassword' } | { kind: 'failed'; message: string }

export const vaultStatus = () => invoke<VaultStatus>('vault_status')

export const createVault = (password: string) =>
  invoke<void>('create_vault', { password })

export const unlockVault = (password: string) =>
  invoke<void>('unlock_vault', { password })

export const lockVault = () => invoke<void>('lock_vault')

export function isWrongPassword(error: unknown) {
  return (error as CommandError | undefined)?.kind === 'wrongPassword'
}

export function errorMessage(error: unknown) {
  const commandError = error as CommandError | undefined
  if (commandError?.kind === 'failed') return commandError.message
  return String(error)
}
