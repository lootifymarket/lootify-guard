import { errorMessage } from '../../api/vault.ts'

export type AccountFailure = { accountName: string; reason: string }

// Each account is a few requests to Steam, possibly through a slow proxy.
const PARALLEL_ACCOUNTS = 4

/** Loads a list for every account, a few at a time, and tags each item with its account. */
export async function fromAccounts<T>(
  accountNames: string[],
  load: (accountName: string) => Promise<T[]>,
) {
  const queue = [...accountNames]
  const items: (T & { accountName: string })[] = []
  const failures: AccountFailure[] = []
  async function worker() {
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        const found = await load(name)
        items.push(...found.map((item) => ({ ...item, accountName: name })))
      } catch (err) {
        failures.push({ accountName: name, reason: errorMessage(err) })
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_ACCOUNTS }, worker))
  return { items, failures }
}
