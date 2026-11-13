import type { Bans, Standing } from '../../../api/security.ts'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import styles from './AccountPage.module.css'

type Fact = { text: string; bad: boolean }

type Words = Dictionary['account']['standing']

type Props = {
  /** `undefined` until Steam was asked. */
  standing: Standing | undefined
  signedIn: boolean
}

/** Rows of the account's facts about what Steam holds against it. */
export default function StandingFacts({ standing, signedIn }: Props) {
  const t = useT().account.standing
  // `null` until Steam has told.
  const rows: [string, Fact | null][] = [
    [t.trading, standing ? trading(t, standing) : null],
    [t.bans, standing?.bans ? bans(t, standing.bans) : null],
    [t.limited, standing ? limited(t, standing.limited) : null],
  ]
  return rows.map(([label, fact]) => (
    <div key={label} className={styles.fact}>
      <dt>{label}</dt>
      {signedIn ? (
        <dd
          className={
            fact === null
              ? styles.muted
              : fact.bad
                ? styles.dangerText
                : undefined
          }
        >
          {fact?.text ?? t.unknown}
        </dd>
      ) : (
        <dd className={styles.muted}>{t.signInToCheck}</dd>
      )}
    </div>
  ))
}

function trading(t: Words, { bans, market }: Standing): Fact | null {
  if (bans?.tradeBan === 'banned') return { text: t.tradeBanned, bad: true }
  if (bans?.tradeBan === 'probation') {
    return { text: t.probation, bad: true }
  }
  if (market) {
    if (market.allowed) return { text: t.available, bad: false }
    return {
      text: market.allowedAt
        ? t.restrictedUntil(
            new Date(market.allowedAt * 1000).toLocaleDateString(),
          )
        : t.restricted,
      bad: true,
    }
  }
  // Without the market's answer, only the trade ban is known.
  return bans ? { text: t.noTradeBan, bad: false } : null
}

function bans(
  t: Words,
  { vacBanned, vacBans, gameBans, daysSinceLast, communityBanned }: Bans,
): Fact {
  // Only the profile answered: it tells whether there's a VAC ban, nothing more.
  if (vacBans === null) {
    return vacBanned
      ? { text: t.vacBanned, bad: true }
      : { text: t.noVacBan, bad: false }
  }
  const games = gameBans ?? 0
  const parts = [
    vacBans > 0 && t.vacBans(vacBans),
    games > 0 && t.gameBans(games),
    communityBanned && t.communityBan,
  ].filter(Boolean)
  if (parts.length === 0) return { text: t.none, bad: false }
  const when =
    vacBans + games > 0 && daysSinceLast !== null
      ? t.daysAgo(daysSinceLast)
      : ''
  return { text: parts.join(', ') + when, bad: true }
}

function limited(t: Words, value: boolean | null): Fact | null {
  if (value === null) return null
  return value
    ? { text: t.limitedYes, bad: true }
    : { text: t.limitedNo, bad: false }
}
