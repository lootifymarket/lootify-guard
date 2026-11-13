import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { GAME_NAMES, type Game } from '../../../api/inventory.ts'
import { startTask, type TaskInput } from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { useT } from '../../../i18n/index.ts'
import layout from '../layout.module.css'
import ProfileOptions, { type ProfileChoice } from './ProfileOptions.tsx'
import Queue from './Queue.tsx'
import styles from './Tasks.module.css'

type Kind = TaskInput['kind']

// In the order they're offered; names and descriptions are in the dictionary.
const KINDS: Kind[] = [
  'hourBoost',
  'cardFarming',
  'moveToStorage',
  'acceptGifts',
  'profile',
  'freeGames',
  'events',
  'check',
  'goOffline',
]

const MAX_AVATAR_BYTES = 1024 * 1024

const AT_ONCE = [1, 2, 3, 5, 10]

const PAUSES: { value: string; min: number; max: number }[] = [
  { value: 'none', min: 0, max: 0 },
  { value: 'short', min: 2, max: 5 },
  { value: 'medium', min: 5, max: 20 },
  { value: 'long', min: 30, max: 90 },
]

/** Every account, the ones in no group, or a group by id. */
type Target = 'all' | 'none' | number

type Props = {
  accounts: Account[]
  groups: Group[]
}

/** Runs one action on many accounts, with limits and random pauses. */
export default function Tasks({ accounts, groups }: Props) {
  const t = useT().tasks
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
    { id: 'all', name: t.allAccounts, accounts },
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      accounts: accounts.filter((account) => account.groupId === group.id),
    })),
    ...(groups.length > 0 && loose.length > 0
      ? [{ id: 'none' as const, name: t.noGroup, accounts: loose }]
      : []),
  ]
  const chosen = targets.find((item) => item.id === target) ?? targets[0]
  const task = t.kinds[kind]
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
      setError(t.imageTooBig)
      return
    }
    setBusy(true)
    setError('')
    try {
      await startTask({
        task: await input(),
        title: kind === 'moveToStorage' ? t.moveTo(storage) : task.name,
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
          <h1 className={layout.title}>{t.title}</h1>
          <span className={styles.subtitle}>{t.subtitle}</span>
        </div>
      </div>

      <div className={styles.columns}>
        <section className={styles.targets} aria-labelledby="targets-title">
          <h2 id="targets-title" className={styles.sectionTitle}>
            {t.groups}
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
          <p className={styles.hint}>{t.groupsHint}</p>
        </section>

        <section className={styles.setup} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.sectionTitle}>
            {chosen.name}
          </h2>
          <div className={styles.tasks} role="radiogroup" aria-label={t.task}>
            {KINDS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={item === kind}
                className={styles.task}
                onClick={() => setKind(item)}
              >
                <span className={styles.taskName}>{t.kinds[item].name}</span>
                <span className={styles.taskText}>{t.kinds[item].text}</span>
              </button>
            ))}
          </div>

          {kind === 'moveToStorage' && (
            <div className={styles.options}>
              <div className={styles.pacing}>
                <Dropdown
                  label={t.to}
                  size="sm"
                  value={storage}
                  options={[
                    { value: '', label: t.pickAccount, disabled: true },
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
                  label={t.game}
                  size="sm"
                  value={game}
                  options={(Object.keys(GAME_NAMES) as Game[]).map((value) => ({
                    value,
                    label: GAME_NAMES[value],
                  }))}
                  onChange={(value) => setGame(value as Game)}
                />
              </div>
              <p className={styles.note}>{t.moveNote}</p>
            </div>
          )}

          {kind === 'hourBoost' && (
            <div className={styles.optionGroup}>
              <TextField
                label={t.games}
                placeholder={t.ownList}
                className={styles.input}
                value={boostGames}
                onChange={(event) => setBoostGames(event.target.value)}
              />
              <p className={styles.note}>{t.boostNote}</p>
            </div>
          )}

          {kind === 'events' && (
            <div className={styles.options}>
              <Dropdown
                label={t.discoveryQueues}
                size="sm"
                value={String(queues)}
                options={[0, 1, 2, 3].map((n) => ({
                  value: String(n),
                  label: t.queues(n),
                }))}
                onChange={(value) => setQueues(Number(value))}
              />
              <div className={styles.option}>
                <span>{t.claimItem}</span>
                <Toggle
                  on={claimItem}
                  label={t.claimItem}
                  onChange={setClaimItem}
                />
              </div>
              <p className={styles.note}>{t.eventsNote}</p>
            </div>
          )}

          {kind === 'freeGames' && (
            <div className={styles.optionGroup}>
              <TextField
                label={t.games}
                placeholder="store.steampowered.com/app/440, sub/12345"
                className={styles.input}
                value={licenses}
                onChange={(event) => setLicenses(event.target.value)}
              />
              <p className={styles.note}>{t.freeGamesNote}</p>
            </div>
          )}

          {kind === 'profile' && (
            <ProfileOptions choice={profile} onChange={setProfile} />
          )}

          {kind === 'acceptGifts' && (
            <div className={styles.option}>
              <span>{t.onlyOwn}</span>
              <Toggle on={onlyOwn} label={t.onlyOwn} onChange={setOnlyOwn} />
            </div>
          )}

          <div className={styles.pacing}>
            <Dropdown
              label={t.atOnce}
              size="sm"
              value={String(atOnce)}
              options={AT_ONCE.map((n) => ({
                value: String(n),
                label: n === 1 ? t.oneByOne : t.accountsAtOnce(n),
              }))}
              onChange={(value) => setAtOnce(Number(value))}
            />
            <Dropdown
              label={t.pause}
              size="sm"
              value={pause}
              options={PAUSES.map((item) => ({
                value: item.value,
                label:
                  item.max === 0 ? t.noPause : t.seconds(item.min, item.max),
              }))}
              onChange={setPause}
            />
          </div>
          <div className={styles.option}>
            <span>{t.retry}</span>
            <Toggle on={retry} label={t.retryLabel} onChange={setRetry} />
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
              {t.runOn(chosen.name, runOn.length)}
            </Button>
          </div>
        </section>

        <Queue started={started} />
      </div>
    </>
  )
}
