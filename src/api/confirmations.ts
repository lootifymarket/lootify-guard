import { invoke } from '@tauri-apps/api/core'
import { words } from '../i18n/index.ts'

export type ConfirmationKind = 'trade' | 'marketListing' | 'apiKey' | 'other'

/** What kind of confirmation it is, in a word, in the language in use. */
export const confirmationKindName = (kind: ConfirmationKind) =>
  words().guard.confirmations.kinds[kind]

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
