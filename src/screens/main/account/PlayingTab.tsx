import { useEffect, useEffectEvent, useState } from 'react'
import {
  farmingNow,
  freeGames,
  MAX_GAMES,
  ownedGames,
  playingList,
  playingNow,
  PRESENCE_NAMES,
  startFarming,
  startPlaying,
  stopPlaying,
  type Farm,
  type FreeGame,
  type OwnedGame,
  type Player,
  type PlayingList,
  type Presence,
} from '../../../api/playing.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import { useToast } from '../../../lib/toast.ts'
import GamePicker from './GamePicker.tsx'
import styles from './PlayingTab.module.css'

const POLL_MS = 1000

type Props = {
  accountName: string
  signedIn: boolean
}

/** Games the account plays on its own Steam connection, for hours and a status. */
export default function PlayingTab({ accountName, signedIn }: Props) {
  const t = useT().account.playing
  const toast = useToast()
  const [draft, setDraft] = useState<PlayingList>({
    games: [],
    status: null,
    presence: 'online',
  })
  const [player, setPlayer] = useState<Player | null>(null)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [owned, setOwned] = useState<OwnedGame[] | undefined>(undefined)
  const [ownedError, setOwnedError] = useState('')
  const [free, setFree] = useState<FreeGame[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Read with each answer, so the elapsed time moves as the page polls.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  function refresh() {
    return Promise.all([playingNow(), farmingNow()]).then(
      ([players, farms]) => {
        const mine = <T extends { accountName: string }>(list: T[]) =>
          list.find((item) => item.accountName === accountName) ?? null
        setNow(Math.floor(Date.now() / 1000))
        setPlayer(mine(players))
        setFarm(mine(farms))
      },
    )
  }
  const poll = useEffectEvent(() => void refresh())
  useEffect(() => {
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    void playingList(accountName).then(setDraft)
  }, [accountName])

  useEffect(() => {
    void freeGames().then(setFree, () => {})
  }, [])

  const ownedFailed = useEffectEvent((err: unknown) =>
    setOwnedError(errorMessage(err)),
  )
  useEffect(() => {
    if (signedIn) void ownedGames(accountName).then(setOwned, ownedFailed)
  }, [accountName, signedIn])

  if (!signedIn) {
    return <p className={styles.muted}>{t.signInFirst}</p>
  }

  const names = new Map(
    [...free, ...(owned ?? [])].map((game) => [game.appId, game.name]),
  )
  const running = player !== null && player.state !== 'stopped'
  const status = draft.status?.trim() || null
  const room = MAX_GAMES - (status ? 1 : 0)
  const farming = farm?.state === 'checking' || farm?.state === 'farming'
  // While farming, the games are the farm's to pick, not the list below.
  const changed =
    running &&
    !farming &&
    (player.games.join() !== draft.games.join() ||
      (player.status ?? null) !== status ||
      player.presence !== draft.presence)

  /** Runs the action, then says how it went in a toast when there's `done` to say. */
  async function act(action: () => Promise<void>, done?: string) {
    setBusy(true)
    setError('')
    try {
      await action()
      if (done) toast(done)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  const start = () =>
    act(
      () =>
        startPlaying(accountName, {
          games: draft.games.slice(0, room),
          status,
          presence: draft.presence,
        }),
      running ? t.applied : t.nowPlaying,
    )

  return (
    <section className={styles.tab} aria-label={t.label}>
      <div className={styles.run}>
        <span className={styles.runWords}>
          <RunTitle t={t} player={player} now={now} />
        </span>
        <span className={styles.runActions}>
          {changed && (
            <Button size="sm" busy={busy} disabled={busy} onClick={start}>
              {t.applyChanges}
            </Button>
          )}
          {running ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(() => stopPlaying(accountName), t.stopped)
              }
            >
              {t.stop}
            </Button>
          ) : (
            <Button
              size="sm"
              busy={busy}
              disabled={busy || (draft.games.length === 0 && !status)}
              onClick={start}
            >
              {t.start}
            </Button>
          )}
        </span>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.run}>
        <span className={styles.runWords}>
          <span className={styles.runTitle}>{t.cardFarming}</span>
          <span className={styles.runText}>
            <FarmText t={t} farm={farm} now={now} />
          </span>
        </span>
        {farming ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void act(() => stopPlaying(accountName))}
          >
            {t.stop}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            busy={busy}
            disabled={busy}
            onClick={() => void act(() => startFarming(accountName))}
          >
            {t.farmCards}
          </Button>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>
          {t.games(draft.games.length, room)}
          {status && t.statusTakesPlace}
        </span>
        <div className={styles.chips}>
          {draft.games.map((id) => (
            <span key={id} className={styles.chip}>
              {names.get(id) || t.app(id)}
              <button
                type="button"
                className={styles.remove}
                aria-label={t.remove(names.get(id) || t.app(id))}
                onClick={() =>
                  setDraft({
                    ...draft,
                    games: draft.games.filter((game) => game !== id),
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className={styles.add}
            onClick={() => setPicking(true)}
          >
            {t.addGame}
          </button>
        </div>
        {ownedError && <p className={styles.muted}>{ownedError}</p>}
      </div>

      <TextField
        label={t.status}
        placeholder={t.statusPlaceholder}
        maxLength={64}
        value={draft.status ?? ''}
        onChange={(event) =>
          setDraft({ ...draft, status: event.target.value || null })
        }
      />
      <Dropdown
        label={t.presence}
        size="sm"
        value={draft.presence}
        options={(Object.keys(PRESENCE_NAMES) as Presence[]).map((value) => ({
          value,
          label: PRESENCE_NAMES[value],
        }))}
        onChange={(value) =>
          setDraft({ ...draft, presence: value as Presence })
        }
      />
      <p className={styles.muted}>{t.hint}</p>

      <GamePicker
        open={picking}
        owned={owned}
        free={free}
        picked={draft.games}
        room={room}
        onClose={() => setPicking(false)}
        onDone={(games) => {
          setDraft({ ...draft, games })
          setPicking(false)
        }}
      />
    </section>
  )
}

type Words = Dictionary['account']['playing']

function RunTitle({
  t,
  player,
  now,
}: {
  t: Words
  player: Player | null
  now: number
}) {
  const [title, text] = (() => {
    switch (player?.state) {
      case undefined:
        return [t.notPlaying, t.startHint]
      case 'stopped':
        return [t.stopped, player.reason]
      case 'connecting':
        return [t.connecting, t.connectingText]
      case 'playing':
        return [t.nowPlaying, elapsed(t, now - player.since)]
      case 'blocked':
        return [t.paused, t.pausedText]
      case 'reconnecting':
        return [
          t.reconnecting,
          t.tryingAgain(player.reason, Math.max(0, player.at - now)),
        ]
    }
  })()
  return (
    <>
      <span className={styles.runTitle}>{title}</span>
      <span className={styles.runText}>{text}</span>
    </>
  )
}

function FarmText({
  t,
  farm,
  now,
}: {
  t: Words
  farm: Farm | null
  now: number
}) {
  switch (farm?.state) {
    case undefined:
      return t.farmIdle
    case 'checking':
      return t.farmChecking
    case 'done':
      return t.farmDone
    case 'stopped':
      return farm.reason
    case 'farming': {
      const drops = farm.games.reduce((sum, game) => sum + game.drops, 0)
      const playing = farm.games
        .filter((game) => farm.playing.includes(game.appId))
        .map((game) => game.name)
      const minutes = Math.max(1, Math.ceil((farm.nextCheck - now) / 60))
      return [
        t.dropsLeft(drops, farm.games.length),
        playing.length === 1
          ? t.farmPlaying(playing[0])
          : t.buildingHours(playing.length),
        farm.problem ?? t.nextCheck(minutes),
      ].join(' · ')
    }
  }
}

function elapsed(t: Words, seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0
    ? t.elapsedHours(hours, pad(minutes))
    : t.elapsedMinutes(minutes, pad(rest))
}
