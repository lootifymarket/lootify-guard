import { invoke } from '@tauri-apps/api/core'

export type ConfirmationKind = 'trade' | 'marketListing' | 'apiKey' | 'other'

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
