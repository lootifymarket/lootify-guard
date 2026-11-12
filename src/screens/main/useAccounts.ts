import { useEffect, useState } from 'react'
import {
  CODE_PERIOD_SECS,
  listAccounts,
  type Account,
  type AccountList,
} from '../../api/accounts.ts'
import { errorMessage } from '../../api/vault.ts'

/** The account list, fetched again whenever the codes in it run out. */
export function useAccounts() {
  const [list, setList] = useState<AccountList | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    listAccounts().then(
      (next) => {
        if (!active) return
        setList(next)
        setError('')
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err))
      },
    )
    return () => {
      active = false
    }
  }, [revision])

  useEffect(() => {
    if (!list) return
    const timer = setTimeout(
      () => setRevision((r) => r + 1),
      list.codesExpireAt * 1000 - Date.now(),
    )
    return () => clearTimeout(timer)
  }, [list])

  return { list, error, reload: () => setRevision((r) => r + 1) }
}

export function useSecondsLeft(expiresAt: number) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return Math.max(0, Math.ceil(expiresAt - now / 1000))
}

/**
 * Seconds until the codes change. The page clock ticks once a second, so right
 * after new codes arrive it can lag and count more than a full period.
 */
export function useCodeSecondsLeft(codesExpireAt: number) {
  return Math.min(useSecondsLeft(codesExpireAt), CODE_PERIOD_SECS)
}

export function matchesQuery(account: Account, query: string) {
  const needle = query.trim().toLowerCase()
  return (
    account.accountName.toLowerCase().includes(needle) ||
    (account.steamId?.includes(needle) ?? false)
  )
}
