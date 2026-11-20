import { useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import { GAME_NAMES, type Game } from '../../../api/inventory.ts'
import { startPlan } from '../../../api/plans.ts'
import { popularGroups, startTask, type TaskInput } from '../../../api/tasks.ts'
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
  GENERATED,
  KEEP_DESCRIPTION,
} from './description.ts'
import ProfileOptions, { type ProfileChoice } from './ProfileOptions.tsx'
import styles from './Tasks.module.css'

/** A task, or a warm-up plan, which runs its steps over days. */
export type Kind = TaskInput['kind'] | 'warmUp'

const MAX_AVATAR_BYTES = 1024 * 1024

const AT_ONCE = [1, 2, 3, 5, 10]

const PAUSES: { value: string; min: number; max: number }[] = [
  { value: 'none', min: 0, max: 0 },
  { value: 'short', min: 2, max: 5 },
  { value: 'medium', min: 5, max: 20 },
  { value: 'long', min: 30, max: 90 },
]

const WISH_SIZES = ['small', 'medium', 'large'] as const
type WishSize = (typeof WISH_SIZES)[number]

const PLAN_STEPS = ['description', 'groups', 'wishlist', 'queue'] as const
type PlanStep = (typeof PLAN_STEPS)[number]
const PLAN_DAYS = [3, 5, 7, 14]
const HOURS = Array.from({ length: 25 }, (_, hour) => hour)

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
  const [groupSource, setGroupSource] = useState<'popular' | 'mine'>('popular')
  const [groupLinks, setGroupLinks] = useState('')
  const [groupsPerRun, setGroupsPerRun] = useState(1)
  const [wishSource, setWishSource] = useState<'popular' | 'mine'>('popular')
  const [wishGames, setWishGames] = useState('')
  const [wishSize, setWishSize] = useState<WishSize>('medium')
  const [planSteps, setPlanSteps] = useState<Record<PlanStep, boolean>>({
    description: true,
    groups: true,
    wishlist: true,
    queue: false,
  })
  const [planDays, setPlanDays] = useState(5)
  const [fromHour, setFromHour] = useState(10)
  const [toHour, setToHour] = useState(23)
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
  const groupsReady = groupSource === 'popular' || groupLinks.trim() !== ''
  const groupsInput = groupSource === 'mine' ? groupLinks : ''
  // The plan writes descriptions as the Profile task is set to, or with every piece.
  const planDescription = describes(profile.description)
    ? profile.description
    : GENERATED
  const ready =
    kind === 'warmUp'
      ? PLAN_STEPS.some((step) => planSteps[step]) &&
        (!planSteps.groups || groupsReady) &&
        (!planSteps.wishlist ||
          wishSource === 'popular' ||
          wishGames.trim() !== '') &&
        fromHour < toHour
      : kind === 'moveToStorage'
        ? storage !== ''
        : kind === 'freeGames'
          ? licenses.trim() !== ''
          : kind === 'events'
            ? queues > 0 || claimItem
            : kind === 'joinGroups'
              ? groupsReady
              : kind === 'wishlist'
                ? wishSource === 'popular' || wishGames.trim() !== ''
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

  async function input(kind: TaskInput['kind']): Promise<TaskInput> {
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
      case 'joinGroups':
        return { kind, groups: groupsInput, perRun: groupsPerRun }
      case 'wishlist':
        return {
          kind,
          games: wishSource === 'mine' ? wishGames : '',
          size: wishSize,
        }
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
      if (kind === 'warmUp') {
        await startPlan({
          target: chosen.name,
          accountNames: runOn.map((account) => account.accountName),
          days: planDays,
          window: {
            fromHour,
            toHour,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
          },
          description: planSteps.description
            ? descriptionSource(planDescription)
            : null,
          groups: planSteps.groups ? groupsInput : null,
          wishlist: planSteps.wishlist
            ? { games: wishSource === 'mine' ? wishGames : '', size: wishSize }
            : null,
          queue: planSteps.queue,
        })
        onStarted()
        close()
        toast(t.plan.started(chosen.name))
        setBusy(false)
        return
      }
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

  function pickGroupSource(value: string) {
    const source = value as 'popular' | 'mine'
    setGroupSource(source)
    // A list of one's own starts as the built-in one, to edit.
    if (source === 'mine' && groupLinks.trim() === '') {
      void popularGroups().then((links) => setGroupLinks(links.join('\n')))
    }
  }

  const groupsField = (
    <>
      <Dropdown
        label={t.groupLinks}
        size="sm"
        value={groupSource}
        options={(['popular', 'mine'] as const).map((value) => ({
          value,
          label: t.groupSources[value],
        }))}
        onChange={pickGroupSource}
      />
      {groupSource === 'mine' && (
        <textarea
          aria-label={t.groupLinks}
          className={styles.textarea}
          rows={6}
          spellCheck={false}
          placeholder={t.groupsPlaceholder}
          value={groupLinks}
          onChange={(event) => setGroupLinks(event.target.value)}
        />
      )}
    </>
  )
  const wishFields = (
    <>
      <div className={styles.pacing}>
        <Dropdown
          label={t.wishGames}
          size="sm"
          value={wishSource}
          options={(['popular', 'mine'] as const).map((value) => ({
            value,
            label: t.wishSources[value],
          }))}
          onChange={(value) => setWishSource(value as 'popular' | 'mine')}
        />
        <Dropdown
          label={t.eachRun}
          size="sm"
          value={wishSize}
          options={WISH_SIZES.map((value) => ({
            value,
            label: t.wishSizes[value],
          }))}
          onChange={(value) => setWishSize(value as WishSize)}
        />
      </div>
      {wishSource === 'mine' && (
        <TextField
          label={t.myGames}
          placeholder={t.myGamesPlaceholder}
          className={styles.input}
          value={wishGames}
          onChange={(event) => setWishGames(event.target.value)}
        />
      )}
    </>
  )

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

              {kind === 'joinGroups' && (
                <div className={styles.options}>
                  {groupsField}
                  <Dropdown
                    label={t.eachRun}
                    size="sm"
                    value={String(groupsPerRun)}
                    options={([1, 2, 3] as const).map((n) => ({
                      value: String(n),
                      label: t.groupsPerRun[n],
                    }))}
                    onChange={(value) => setGroupsPerRun(Number(value))}
                  />
                  <p className={styles.note}>{t.joinNote}</p>
                </div>
              )}

              {kind === 'wishlist' && (
                <div className={styles.options}>
                  {wishFields}
                  <p className={styles.note}>{t.wishNote}</p>
                </div>
              )}

              {kind === 'warmUp' && (
                <div className={styles.options}>
                  <div>
                    {PLAN_STEPS.map((step) => (
                      <div key={step} className={styles.planStep}>
                        <span className={styles.planStepWords}>
                          <span>{t.plan.steps[step].name}</span>
                          <span className={styles.note}>
                            {t.plan.steps[step].hint}
                          </span>
                        </span>
                        <Toggle
                          on={planSteps[step]}
                          label={t.plan.steps[step].name}
                          onChange={(on) =>
                            setPlanSteps({ ...planSteps, [step]: on })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {planSteps.groups && groupsField}
                  {planSteps.wishlist && wishFields}
                  <div className={styles.pacingRow}>
                    <Dropdown
                      label={t.plan.over}
                      size="sm"
                      value={String(planDays)}
                      options={PLAN_DAYS.map((n) => ({
                        value: String(n),
                        label: t.plan.days(n),
                      }))}
                      onChange={(value) => setPlanDays(Number(value))}
                    />
                    <Dropdown
                      label={t.plan.from}
                      size="sm"
                      value={String(fromHour)}
                      options={HOURS.slice(0, 24).map((hour) => ({
                        value: String(hour),
                        label: clock(hour),
                      }))}
                      onChange={(value) => setFromHour(Number(value))}
                    />
                    <Dropdown
                      label={t.plan.to}
                      size="sm"
                      value={String(toHour)}
                      options={HOURS.slice(1).map((hour) => ({
                        value: String(hour),
                        label: clock(hour),
                        disabled: hour <= fromHour,
                      }))}
                      onChange={(value) => setToHour(Number(value))}
                    />
                  </div>
                  <p className={styles.note}>{t.plan.note}</p>
                </div>
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

          {kind !== 'warmUp' && (
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
          )}

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
              {kind === 'warmUp'
                ? target === 'picked'
                  ? t.plan.startOnPicked(runOn.length)
                  : t.plan.startOn(chosen.name, runOn.length)
                : target === 'picked'
                  ? t.runOnPicked(runOn.length)
                  : t.runOn(chosen.name, runOn.length)}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

/** An hour of the day as a clock shows it; 24 is midnight at the day's end. */
function clock(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}
