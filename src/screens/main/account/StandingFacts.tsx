import type { Bans, Standing } from '../../../api/security.ts'
import styles from './AccountPage.module.css'

type Fact = { text: string; bad: boolean }

const UNKNOWN: Fact = { text: 'Unknown', bad: false }

type Props = {
  /** `undefined` until Steam was asked. */
  standing: Standing | undefined
  signedIn: boolean
}

/** Rows of the account's facts about what Steam holds against it. */
export default function StandingFacts({ standing, signedIn }: Props) {
  const rows: [string, Fact][] = [
    ['Trading and market', standing ? trading(standing) : UNKNOWN],
    ['VAC and game bans', standing?.bans ? bans(standing.bans) : UNKNOWN],
    ['Limited', standing ? limited(standing.limited) : UNKNOWN],
  ]
  return rows.map(([label, fact]) => (
    <div key={label} className={styles.fact}>
      <dt>{label}</dt>
      {signedIn ? (
        <dd
          className={
            fact.bad
              ? styles.dangerText
              : fact === UNKNOWN
                ? styles.muted
                : undefined
          }
        >
          {fact.text}
        </dd>
      ) : (
        <dd className={styles.muted}>Sign in to check</dd>
      )}
    </div>
  ))
}

function trading({ bans, market }: Standing): Fact {
  if (bans?.tradeBan === 'banned') return { text: 'Trade banned', bad: true }
  if (bans?.tradeBan === 'probation') {
    return { text: 'On trade probation', bad: true }
  }
  if (market) {
    if (market.allowed) return { text: 'Available', bad: false }
    return {
      text: market.allowedAt
        ? `Restricted until ${new Date(market.allowedAt * 1000).toLocaleDateString()}`
        : 'Restricted',
      bad: true,
    }
  }
  // Without the market's answer, only the trade ban is known.
  return bans ? { text: 'No trade ban', bad: false } : UNKNOWN
}

function bans({
  vacBanned,
  vacBans,
  gameBans,
  daysSinceLast,
  communityBanned,
}: Bans): Fact {
  // Only the profile answered: it tells whether there's a VAC ban, nothing more.
  if (vacBans === null) {
    return vacBanned
      ? { text: 'VAC banned', bad: true }
      : { text: 'No VAC ban', bad: false }
  }
  const games = gameBans ?? 0
  const parts = [
    vacBans > 0 && `${vacBans} VAC ${vacBans === 1 ? 'ban' : 'bans'}`,
    games > 0 && `${games} game ${games === 1 ? 'ban' : 'bans'}`,
    communityBanned && 'community ban',
  ].filter(Boolean)
  if (parts.length === 0) return { text: 'None', bad: false }
  const when =
    vacBans + games > 0 && daysSinceLast !== null
      ? ` · ${daysSinceLast} days ago`
      : ''
  return { text: parts.join(', ') + when, bad: true }
}

function limited(value: boolean | null): Fact {
  if (value === null) return UNKNOWN
  return value
    ? { text: 'Yes, until $5 is spent in Steam', bad: true }
    : { text: 'No', bad: false }
}
