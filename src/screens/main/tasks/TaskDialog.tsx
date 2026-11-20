import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { GAME_NAMES, type Game } from '../../../api/inventory.ts'
import { startTask, type TaskInput } from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import AccountPicker from './AccountPicker.tsx'
import {
  describes,
  descriptionSource,
  KEEP_DESCRIPTION,
} from './description.ts'
import ProfileOptions, { type ProfileChoice } from './ProfileOptions.tsx'
import styles from './Tasks.module.css'

export type Kind = TaskInput['kind']

const MAX_AVATAR_BYTES = 1024 * 1024

const AT_ONCE = [1, 2, 3, 5, 10]

const PAUSES: { value: string; min: number; max: number }[] = [
  { value: 'none', min: 0, max: 0 },
  { value: 'short', min: 2, max: 5 },
  { value: 'medium', min: 5, max: 20 },
  { value: 'long', min: 30, max: 90 },
]

// Tasks with nothing to set besides whom they run on.
const PLAIN: Kind[] = ['check', 'cardFarming', 'goOffline']

/** Every account, the ones in no group, a group by id, or accounts picked one by one. */
type Target = 'all' | 'none' | 'picked' | number

type Props = {
  /** The task the dialog is open for; `null` while it's closed. */
  kind: Kind | null
  accounts: Account[]
  groups: Group[]
  onClose: () => void
  onStarted: () => void
}

/**
 * Sets up a task and starts it. It stays mounted while closed, so the next task
 * starts from the same accounts and settings.
 */
export default function TaskDialog({
  kind,
  accounts,
  groups,
  onClose,
  onStarted,
}: Props) {
  const words = useT()
  const t = words.tasks
  const toast = useToast()
  const [target, setTarget] = useState<Target>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [onlyOwn, setOnlyOwn] = useState(true)
  const [profile, setProfile] = useState<ProfileChoice>({
    nameTemplate: '',
    description: KEEP_DESCRIPTION,
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

  const loose = accounts.filter((account) => account.groupIds.length === 0)
  const targets: { id: Target; name: string; accounts: Account[] }[] = [
    { id: 'all', name: t.allAccounts, accounts },
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      accounts: accounts.filter((account) =>
        account.groupIds.includes(group.id),
      ),
    })),
    ...(groups.length > 0 && loose.length > 0
      ? [{ id: 'none' as const, name: t.noGroup, accounts: loose }]
      : []),
    {
      id: 'picked',
      name: t.pickedAccounts,
      accounts: accounts.filter((account) => picked.has(account.accountName)),
    },
  ]
  const chosen = targets.find((item) => item.id === target) ?? targets[0]
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
            // A description that can't be made holds the whole task back.
            ((profile.description.mode === 'keep' ||
              describes(profile.description)) &&
              (profile.nameTemplate.trim() !== '' ||
                profile.description.mode !== 'keep' ||
                Object.keys(profile.privacy).length > 0 ||
                profile.avatar !== null))

  function pickTarget(value: string) {
    const next: Target =
      value === 'all' || value === 'none' || value === 'picked'
        ? value
        : Number(value)
    // Picking one by one starts from whoever was chosen.
    if (next === 'picked' && target !== 'picked') {
      setPicked(new Set(chosen.accounts.map((account) => account.accountName)))
    }
    setTarget(next)
  }

  async function input(kind: Kind): Promise<TaskInput> {
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
          description: descriptionSource(profile.description),
          privacy: profile.privacy,
          avatar: avatar
            ? Array.from(new Uint8Array(await avatar.arrayBuffer()))
            : null,
        }
      }
    }
  }

  function close() {
    setError('')
    onClose()
  }

  async function run(kind: Kind) {
    const range = PAUSES.find((item) => item.value === pause) ?? PAUSES[0]
    if (kind === 'profile' && (profile.avatar?.size ?? 0) > MAX_AVATAR_BYTES) {
      setError(t.imageTooBig)
      return
    }
    setBusy(true)
    setError('')
    try {
      const title =
        kind === 'moveToStorage' ? t.moveTo(storage) : t.kinds[kind].name
      await startTask({
        task: await input(kind),
        title,
        target: chosen.name,
        accountNames: runOn.map((account) => account.accountName),
        pacing: { atOnce, pauseMin: range.min, pauseMax: range.max, retry },
      })
      onStarted()
      close()
      toast(t.started(title, chosen.name))
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <Dialog
      open={kind !== null}
      wide
      title={kind ? t.kinds[kind].name : ''}
      onClose={close}
    >
      {kind && (
        <>
          <p className={dialogStyles.text}>{t.kinds[kind].text}</p>

          <div className={styles.block}>
            <div className={styles.accountsHead}>
              <span className={styles.fieldLabel}>{t.accounts}</span>
              <span className={styles.fieldLabel}>
                {t.selected(runOn.length, accounts.length)}
              </span>
            </div>
            <Dropdown
              label={t.accounts}
              hideLabel
              size="sm"
              value={String(chosen.id)}
              options={targets.map((item) => ({
                value: String(item.id),
                label: item.id === 'picked' ? t.pickAccounts : item.name,
                hint:
                  item.id === 'picked'
                    ? undefined
                    : t.accountCount(item.accounts.length),
              }))}
              onChange={pickTarget}
            />
            {target === 'picked' && (
              <AccountPicker
                accounts={accounts}
                groups={groups}
                picked={picked}
                onChange={setPicked}
              />
            )}
          </div>

          {!PLAIN.includes(kind) && (
            <div className={styles.block}>
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
                      options={(Object.keys(GAME_NAMES) as Game[]).map(
                        (value) => ({ value, label: GAME_NAMES[value] }),
                      )}
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
                  <Toggle
                    on={onlyOwn}
                    label={t.onlyOwn}
                    onChange={setOnlyOwn}
                  />
                </div>
              )}
            </div>
          )}

          <div className={`${styles.block} ${styles.pacingRow}`}>
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
            <div className={styles.retryCell}>
              <span className={styles.fieldLabel}>{t.retry}</span>
              <span className={styles.retryToggle}>
                <Toggle on={retry} label={t.retryLabel} onChange={setRetry} />
              </span>
            </div>
          </div>

          {error && (
            <p className={dialogStyles.error} role="alert">
              {error}
            </p>
          )}
          <div className={dialogStyles.actions}>
            <Button variant="secondary" size="sm" onClick={close}>
              {words.common.cancel}
            </Button>
            <Button
              size="sm"
              busy={busy}
              disabled={busy || !ready || runOn.length === 0}
              onClick={() => void run(kind)}
            >
              {target === 'picked'
                ? t.runOnPicked(runOn.length)
                : t.runOn(chosen.name, runOn.length)}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
