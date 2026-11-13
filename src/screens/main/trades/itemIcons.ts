import { useEffect, useSyncExternalStore } from 'react'
import { itemIcons } from '../../../api/trades.ts'

// Pictures are the same for every account; the account only picks the proxy.
const loaded = new Map<string, string>()
const asked = new Set<string>()
const queue: { accountName: string; icon: string }[] = []
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

// Cards that come into view together are asked for in one go.
const BATCH = 50
const GATHER_MS = 60

function ask(accountName: string, icon: string) {
  if (asked.has(icon)) return
  asked.add(icon)
  queue.push({ accountName, icon })
  timer ??= setTimeout(() => void flush(), GATHER_MS)
}

async function flush() {
  timer = null
  const accountName = queue[0]?.accountName
  if (!accountName) return
  const batch: string[] = []
  for (let i = 0; i < queue.length && batch.length < BATCH;) {
    if (queue[i].accountName === accountName) {
      batch.push(queue[i].icon)
      queue.splice(i, 1)
    } else {
      i += 1
    }
  }
  try {
    const found = await itemIcons(accountName, batch)
    for (const [icon, url] of Object.entries(found)) loaded.set(icon, url)
  } catch {
    // A card without a picture still works; it is not asked for again.
  }
  for (const listener of listeners) listener()
  if (queue.length > 0) timer ??= setTimeout(() => void flush(), 0)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The picture for an item, asked for once the card is `visible`. */
export function useItemIcon(
  accountName: string,
  icon: string | null,
  visible: boolean,
) {
  useEffect(() => {
    if (icon && visible) ask(accountName, icon)
  }, [accountName, icon, visible])
  return useSyncExternalStore(subscribe, () =>
    icon ? (loaded.get(icon) ?? null) : null,
  )
}
