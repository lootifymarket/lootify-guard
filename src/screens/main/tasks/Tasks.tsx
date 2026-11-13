import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { GAME_NAMES, type Game } from '../../../api/inventory.ts'
import { startTask, type TaskInput } from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import Toggle from '../../../components/Toggle.tsx'
import layout from '../layout.module.css'
import ProfileOptions, { type ProfileChoice } from './ProfileOptions.tsx'
import Queue from './Queue.tsx'
import styles from './Tasks.module.css'

type Kind = TaskInput['kind']

const TASKS: { kind: Kind; name: string; text: string }[] = [
  {
    kind: 'hourBoost',
    name: 'Hour boost',
    text: 'Play games on a connection that stays up',
  },
  {
    kind: 'cardFarming',
    name: 'Card farming',
    text: 'Play the games with card drops left until they run out',
  },
  {
    kind: 'moveToStorage',
    name: 'Move to storage',
    text: 'Every tradable item to one account',
  },
  {
    kind: 'acceptGifts',
    name: 'Accept gifts',
    text: 'Incoming offers where the account gives nothing',
  },
  {
    kind: 'profile',
    name: 'Profile',
    text: 'Nickname, avatar and privacy',
  },
  {
    kind: 'freeGames',
    name: 'Free games',
    text: 'Free licenses by store link or ID',
  },
  {
    kind: 'events',
    name: 'Events',
    text: 'Discovery queue and the free sale item',
  },
  {
    kind: 'check',
    name: 'Check',
    text: 'Session, profile, Web API key, bans and limits',
  },
  {
    kind: 'goOffline',
    name: 'Go offline',
    text: 'Stop playing and sign the game connection out',
  },
]

const MAX_AVATAR_BYTES = 1024 * 1024

const AT_ONCE = [1, 2, 3, 5, 10]

const PAUSES: { value: string; label: string; min: number; max: number }[] = [
  { value: 'none', label: 'None', min: 0, max: 0 },
  { value: 'short', label: '2–5 s', min: 2, max: 5 },
  { value: 'medium', label: '5–20 s', min: 5, max: 20 },
  { value: 'long', label: '30–90 s', min: 30, max: 90 },
]

/** Every account, the ones in no group, or a group by id. */
type Target = 'all' | 'none' | number

type Props = {
  accounts: Account[]
  groups: Group[]
}

/** Runs one action on many accounts, with limits and random pauses. */
export default function Tasks({ accounts, groups }: Props) {
  const [target, setTarget] = useState<Target>('all')
  const [kind, setKind] = useState<Kind>('check')
  const [onlyOwn, setOnlyOwn] = useState(true)
  const [profile, setProfile] = useState<ProfileChoice>({
    nameTemplate: '',
    privacy: {},
    avatar: null,
  })
  const [storage, setStorage] = useState('')
  const [game, setGame] = useState<Game>('cs2')
  const [licenses, setLicenses] = useState('')
  const [boostGames, setBoostGames] = useState('')
  const [queues, setQueues] = useState(1)
  const [claimItem, setClaimItem] = useState(true)
  const [atOnce, setAtOnce] = useState(3)
  const [pause, setPause] = useState('medium')
  const [retry, setRetry] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(0)

  const loose = accounts.filter((account) => account.groupId === null)
  const targets: { id: Target; name: string; accounts: Account[] }[] = [
    { id: 'all', name: 'All accounts', accounts },
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      accounts: accounts.filter((account) => account.groupId === group.id),
    })),
    ...(groups.length > 0 && loose.length > 0
      ? [{ id: 'none' as const, name: 'No group', accounts: loose }]
      : []),
  ]
  const chosen = targets.find((item) => item.id === target) ?? targets[0]
  const task = TASKS.find((item) => item.kind === kind) ?? TASKS[0]
  // The storage account has nothing to send to itself.
  const runOn =
    kind === 'moveToStorage'
      ? chosen.accounts.filter((account) => account.accountName !== storage)
      : chosen.accounts
  const ready =
    kind === 'moveToStorage'
      ? storage !== ''
      : kind === 'freeGames'
        ? licenses.trim() !== ''
        : kind === 'events'
          ? queues > 0 || claimItem
          : kind !== 'profile' ||
            profile.nameTemplate.trim() !== '' ||
            Object.keys(profile.privacy).length > 0 ||
            profile.avatar !== null

  async function input(): Promise<TaskInput> {
    switch (kind) {
      case 'check':
        return { kind }
      case 'acceptGifts':
        return { kind, onlyOwn }
      case 'moveToStorage':
        return { kind, storage, game }
      case 'freeGames':
        return { kind, licenses }
      case 'hourBoost':
        return { kind, games: boostGames }
      case 'goOffline':
      case 'cardFarming':
        return { kind }
      case 'events':
        return { kind, queues, claimItem }
      case 'profile': {
        const { avatar } = profile
        return {
          kind,
          nameTemplate: profile.nameTemplate.trim() || null,
          privacy: profile.privacy,
          avatar: avatar
            ? Array.from(new Uint8Array(await avatar.arrayBuffer()))
            : null,
        }
      }
    }
  }

  async function run() {
    const range = PAUSES.find((item) => item.value === pause) ?? PAUSES[0]
    if (kind === 'profile' && (profile.avatar?.size ?? 0) > MAX_AVATAR_BYTES) {
      setError('The image is over 1 MB')
      return
    }
    setBusy(true)
    setError('')
    try {
      await startTask({
        task: await input(),
        title: kind === 'moveToStorage' ? `Move to ${storage}` : task.name,
        target: chosen.name,
        accountNames: runOn.map((account) => account.accountName),
        pacing: { atOnce, pauseMin: range.min, pauseMax: range.max, retry },
      })
      setStarted((n) => n + 1)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>Tasks</h1>
          <span className={styles.subtitle}>
            Run actions on a whole group of accounts, with limits and random
            pauses
          </span>
        </div>
      </div>

      <div className={styles.columns}>
        <section className={styles.targets} aria-labelledby="targets-title">
          <h2 id="targets-title" className={styles.sectionTitle}>
            Groups
          </h2>
          {targets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.target}
              aria-pressed={item.id === chosen.id}
              onClick={() => setTarget(item.id)}
            >
              <span>{item.name}</span>
              <span className={styles.count}>{item.accounts.length}</span>
            </button>
          ))}
          <p className={styles.hint}>Make groups on the Accounts screen.</p>
        </section>

        <section className={styles.setup} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.sectionTitle}>
            {chosen.name}
          </h2>
          <div className={styles.tasks} role="radiogroup" aria-label="Task">
            {TASKS.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="radio"
                aria-checked={item.kind === kind}
                className={styles.task}
                onClick={() => setKind(item.kind)}
              >
                <span className={styles.taskName}>{item.name}</span>
                <span className={styles.taskText}>{item.text}</span>
              </button>
            ))}
          </div>

          {kind === 'moveToStorage' && (
            <div className={styles.options}>
              <div className={styles.pacing}>
                <Dropdown
                  label="To"
                  size="sm"
                  value={storage}
                  options={[
                    { value: '', label: 'Pick an account', disabled: true },
                    ...accounts.map((account) => ({
                      value: account.accountName,
                      label: account.personaName || account.accountName,
                      hint: account.personaName
                        ? account.accountName
                        : undefined,
                    })),
                  ]}
                  onChange={setStorage}
                />
                <Dropdown
                  label="Game"
                  size="sm"
                  value={game}
                  options={(Object.keys(GAME_NAMES) as Game[]).map((value) => ({
                    value,
                    label: GAME_NAMES[value],
                  }))}
                  onChange={(value) => setGame(value as Game)}
                />
              </div>
              <p className={styles.note}>
                Each account sends an offer with all its tradable items, and the
                storage account accepts it. No phone needed.
              </p>
            </div>
          )}

          {kind === 'hourBoost' && (
            <div className={styles.optionGroup}>
              <TextField
                label="Games"
                placeholder="Each account's own list"
                className={styles.input}
                value={boostGames}
                onChange={(event) => setBoostGames(event.target.value)}
              />
              <p className={styles.note}>
                App IDs or store links, up to 32. Left empty, each account plays
                the games on its Playing tab. Accounts keep playing until Go
                offline, and reconnect by themselves.
              </p>
            </div>
          )}

          {kind === 'events' && (
            <div className={styles.options}>
              <Dropdown
                label="Discovery queues"
                size="sm"
                value={String(queues)}
                options={[0, 1, 2, 3].map((n) => ({
                  value: String(n),
                  label: n === 0 ? 'None' : n === 1 ? '1 queue' : `${n} queues`,
                }))}
                onChange={(value) => setQueues(Number(value))}
              />
              <div className={styles.option}>
                <span>Claim the free sale item</span>
                <Toggle
                  on={claimItem}
                  label="Claim the free sale item"
                  onChange={setClaimItem}
                />
              </div>
              <p className={styles.note}>
                During Steam sales and festivals, viewing the queue gives
                trading cards and the free item is a sticker or similar. With no
                sale on, there's nothing to get.
              </p>
            </div>
          )}

          {kind === 'freeGames' && (
            <div className={styles.optionGroup}>
              <TextField
                label="Games"
                placeholder="store.steampowered.com/app/440, sub/12345"
                className={styles.input}
                value={licenses}
                onChange={(event) => setLicenses(event.target.value)}
              />
              <p className={styles.note}>
                Store links, app/… or sub/… IDs, split by spaces or commas. A
                plain number is an app ID. Games already owned are skipped.
              </p>
            </div>
          )}

          {kind === 'profile' && (
            <ProfileOptions choice={profile} onChange={setProfile} />
          )}

          {kind === 'acceptGifts' && (
            <div className={styles.option}>
              <span>Only from my accounts</span>
              <Toggle
                on={onlyOwn}
                label="Only from my accounts"
                onChange={setOnlyOwn}
              />
            </div>
          )}

          <div className={styles.pacing}>
            <Dropdown
              label="At once"
              size="sm"
              value={String(atOnce)}
              options={AT_ONCE.map((n) => ({
                value: String(n),
                label: n === 1 ? 'One by one' : `${n} accounts`,
              }))}
              onChange={(value) => setAtOnce(Number(value))}
            />
            <Dropdown
              label="Pause between accounts"
              size="sm"
              value={pause}
              options={PAUSES}
              onChange={setPause}
            />
          </div>
          <div className={styles.option}>
            <span>Retry failed accounts (up to 3 times)</span>
            <Toggle
              on={retry}
              label="Retry failed accounts"
              onChange={setRetry}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.run}>
            <Button
              busy={busy}
              disabled={busy || !ready || runOn.length === 0}
              onClick={() => void run()}
            >
              Run on {chosen.name} ({runOn.length})
            </Button>
          </div>
        </section>

        <Queue started={started} />
      </div>
    </>
  )
}
