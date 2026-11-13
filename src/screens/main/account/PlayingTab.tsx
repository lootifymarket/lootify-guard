import { useEffect, useEffectEvent, useState } from 'react'
import {
  MAX_GAMES,
  ownedGames,
  playingList,
  playingNow,
  PRESENCE_NAMES,
  startPlaying,
  stopPlaying,
  type OwnedGame,
  type Player,
  type PlayingList,
  type Presence,
} from '../../../api/playing.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import GamePicker from './GamePicker.tsx'
import styles from './PlayingTab.module.css'

const POLL_MS = 1000

type Props = {
  accountName: string
  signedIn: boolean
}

/** Games the account plays on its own Steam connection, for hours and a status. */
export default function PlayingTab({ accountName, signedIn }: Props) {
  const [draft, setDraft] = useState<PlayingList>({
    games: [],
    status: null,
    presence: 'online',
  })
  const [player, setPlayer] = useState<Player | null>(null)
  const [owned, setOwned] = useState<OwnedGame[] | undefined>(undefined)
  const [ownedError, setOwnedError] = useState('')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Read with each answer, so the elapsed time moves as the page polls.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  function refresh() {
    return playingNow().then((players) => {
      setNow(Math.floor(Date.now() / 1000))
      setPlayer(
        players.find((item) => item.accountName === accountName) ?? null,
      )
    })
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

  const ownedFailed = useEffectEvent((err: unknown) =>
    setOwnedError(errorMessage(err)),
  )
  useEffect(() => {
    if (signedIn) void ownedGames(accountName).then(setOwned, ownedFailed)
  }, [accountName, signedIn])

  if (!signedIn) {
    return (
      <p className={styles.muted}>
        Sign in to Steam on the Security tab to play games.
      </p>
    )
  }

  const names = new Map(owned?.map((game) => [game.appId, game.name]))
  const running = player !== null && player.state !== 'stopped'
  const status = draft.status?.trim() || null
  const room = MAX_GAMES - (status ? 1 : 0)
  const changed =
    running &&
    (player.games.join() !== draft.games.join() ||
      (player.status ?? null) !== status ||
      player.presence !== draft.presence)

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  const start = () =>
    act(() =>
      startPlaying(accountName, {
        games: draft.games.slice(0, room),
        status,
        presence: draft.presence,
      }),
    )

  return (
    <section className={styles.tab} aria-label="Playing">
      <div className={styles.run}>
        <span className={styles.runWords}>
          <RunTitle player={player} now={now} />
        </span>
        <span className={styles.runActions}>
          {changed && (
            <Button size="sm" busy={busy} disabled={busy} onClick={start}>
              Apply changes
            </Button>
          )}
          {running ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void act(() => stopPlaying(accountName))}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              busy={busy}
              disabled={busy || (draft.games.length === 0 && !status)}
              onClick={start}
            >
              Start
            </Button>
          )}
        </span>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.label}>
          Games · {draft.games.length} of {room}
          {status && ' (the status takes one place)'}
        </span>
        <div className={styles.chips}>
          {draft.games.map((id) => (
            <span key={id} className={styles.chip}>
              {names.get(id) || `App ${id}`}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${names.get(id) || `app ${id}`}`}
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
            + Game
          </button>
        </div>
        {ownedError && <p className={styles.muted}>{ownedError}</p>}
      </div>

      <TextField
        label="Custom status (shown on the profile instead of a game)"
        placeholder="Trading on Lootify Market"
        maxLength={64}
        value={draft.status ?? ''}
        onChange={(event) =>
          setDraft({ ...draft, status: event.target.value || null })
        }
      />
      <Dropdown
        label="Presence"
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
      <p className={styles.muted}>
        Steam counts hours only for games the account owns. Playing here while
        someone plays on another device pauses until they stop.
      </p>

      <GamePicker
        open={picking}
        owned={owned}
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

function RunTitle({ player, now }: { player: Player | null; now: number }) {
  const [title, text] = (() => {
    switch (player?.state) {
      case undefined:
        return ['Not playing', 'Start to show the games on the profile']
      case 'stopped':
        return ['Stopped playing', player.reason]
      case 'connecting':
        return ['Connecting…', 'Signing in to Steam as the client']
      case 'playing':
        return ['Now playing', elapsed(now - player.since)]
      case 'blocked':
        return [
          'Paused',
          'Someone is playing on another device; hours resume when they stop',
        ]
      case 'reconnecting':
        return [
          'Reconnecting',
          `${player.reason}. Trying again in ${Math.max(0, player.at - now)} s`,
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

function elapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0
    ? `${hours} h ${pad(minutes)} min`
    : `${minutes} min ${pad(rest)} s`
}
