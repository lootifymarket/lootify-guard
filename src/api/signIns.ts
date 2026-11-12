import { invoke } from '@tauri-apps/api/core'

export type SignInPlatform =
  'steamClient' | 'webBrowser' | 'mobileApp' | 'unknown'

export type SignInRequest = {
  /** A u64 as text, since JavaScript numbers can't hold it exactly. */
  clientId: string
  version: number
  ip: string
  city: string
  country: string
  deviceName: string
  platform: SignInPlatform
  /** A new IP for the account, or a location that doesn't match the request. */
  unfamiliar: boolean
}

export const listSignInRequests = (accountName: string) =>
  invoke<SignInRequest[]>('list_sign_in_requests', { accountName })

export const answerSignIn = (
  accountName: string,
  request: Pick<SignInRequest, 'clientId' | 'version'>,
  allow: boolean,
) =>
  invoke<void>('answer_sign_in', {
    accountName,
    clientId: request.clientId,
    version: request.version,
    allow,
  })

/** Allows the sign-in behind a Steam QR code, given the link it holds. */
export const allowQrSignIn = (accountName: string, link: string) =>
  invoke<void>('allow_qr_sign_in', { accountName, link })
