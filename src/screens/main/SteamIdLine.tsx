import type { Account } from '../../api/accounts.ts'
import Private from '../../components/Private.tsx'
import { MASK } from '../../lib/streamer.ts'

/** The login when a nickname is shown above it, then the Steam ID, which streamer mode hides. */
export default function SteamIdLine({ account }: { account: Account }) {
  const login = account.personaName ? account.accountName : null
  if (!login && !account.steamId) return null
  return (
    <>
      {login}
      {login && account.steamId && ' · '}
      {account.steamId && <Private mask={MASK.id}>{account.steamId}</Private>}
    </>
  )
}
