import { invoke } from '@tauri-apps/api/core'

export type ConfirmationKind = 'trade' | 'marketListing' | 'apiKey' | 'other'

export const CONFIRMATION_KIND_NAMES: Record<ConfirmationKind, string> = {
  trade: 'Trade',
  marketListing: 'Market',
  apiKey: 'API key',
  other: 'Other',
}

export type Confirmation = {
  id: string
  nonce: string
  kind: ConfirmationKind
  typeName: string
  headline: string
  summary: string[]
  /** Unix seconds. */
  createdAt: number
}

export const listConfirmations = (accountName: string) =>
  invoke<Confirmation[]>('list_confirmations', { accountName })

export const respondToConfirmations = (
  accountName: string,
  confirmations: Pick<Confirmation, 'id' | 'nonce'>[],
  accept: boolean,
) =>
  invoke<void>('respond_to_confirmations', {
    accountName,
    confirmations: confirmations.map(({ id, nonce }) => ({ id, nonce })),
    accept,
  })
