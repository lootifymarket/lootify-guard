import { invoke } from '@tauri-apps/api/core'
import { fromBackend } from '../i18n/backend/index.ts'

export type ProxyKind = 'http' | 'socks5'

export const PROXY_KIND_NAMES: Record<ProxyKind, string> = {
  http: 'HTTP',
  socks5: 'SOCKS5',
}

export type Proxy = {
  id: number
  name: string | null
  /** Two-letter country code from the last check. */
  country: string | null
  kind: ProxyKind
  /** host:port, without the login or password. */
  address: string
  hasLogin: boolean
  accounts: string[]
}

export type AddReport = {
  added: number
  alreadyAdded: number
  failed: { line: number; reason: string }[]
}

export type ProxyFields = {
  kind: ProxyKind
  host: string
  port: number
  login: string | null
  password: string | null
}

export type CheckResult = {
  pingMs: number
  country: string | null
}

export const listProxies = () => invoke<Proxy[]>('list_proxies')

/** One proxy per line, in any of the usual list formats. */
export const addProxies = (text: string) =>
  invoke<AddReport>('add_proxies', { text }).then((report) => ({
    ...report,
    failed: report.failed.map((failure) => ({
      ...failure,
      reason: fromBackend(failure.reason),
    })),
  }))

/** Resolves to false when the same proxy is already in the list. */
export const addProxy = (
  fields: ProxyFields,
  name: string | null,
  country: string | null,
) => invoke<boolean>('add_proxy', { fields, name, country })

/** Checks a proxy from the form before it is saved. */
export const testProxy = (fields: ProxyFields) =>
  invoke<CheckResult>('test_proxy', { fields })

/** Splits a pasted link such as `socks5://login:pass@host:port` into fields. */
export const parseProxy = (link: string) =>
  invoke<ProxyFields>('parse_proxy', { link })

export const removeProxy = (id: number) => invoke<void>('remove_proxy', { id })

/** Times a request to Steam through the proxy and looks up its country. */
export const checkProxy = (id: number) =>
  invoke<CheckResult>('check_proxy', { id })

/** The name if the user gave one, otherwise the address. */
export const proxyTitle = (proxy: Proxy) => proxy.name || proxy.address
