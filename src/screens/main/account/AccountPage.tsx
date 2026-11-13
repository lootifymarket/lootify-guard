import { useEffect, useEffectEvent, useState } from 'react'
import {
  CODE_PERIOD_SECS,
  describe,
  exportMaFile,
  refreshProfile,
  revealRevocationCode,
  setAccountProxy,
  type Account,
  type Group,
} from '../../../api/accounts.ts'
import {
  AUTO_CONFIRM_RULES,
  setAutoConfirmRule,
  type AutoConfirmRule,
} from '../../../api/autoConfirm.ts'
import {
  listProxies,
  PROXY_KIND_NAMES,
  proxyTitle,
  type Proxy,
} from '../../../api/proxies.ts'
import { setAccountGroup } from '../../../api/groups.ts'
import {
  formatMoney,
  walletBalance,
  type Wallet,
} from '../../../api/profile.ts'
import {
  checkApiKey,
  checkStanding,
  listDevices,
  type ApiKey,
  type Device,
  type Standing,
} from '../../../api/security.ts'
import {
  biometricStatus,
  errorMessage,
  type BiometricMethod,
} from '../../../api/vault.ts'
import Avatar from '../../../components/Avatar.tsx'
import Button from '../../../components/Button.tsx'
import Dropdown, { type DropdownOption } from '../../../components/Dropdown.tsx'
import Flag from '../../../components/Flag.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import { useCopy } from '../../../lib/useCopy.ts'
import { useCodeSecondsLeft } from '../useAccounts.ts'
import AutoConfirmRules from '../AutoConfirmRules.tsx'
import ApiKeyAlert from './ApiKeyAlert.tsx'
import DeviceRow from './DeviceRow.tsx'
import NoteField from './NoteField.tsx'
import PlayingTab from './PlayingTab.tsx'
import ProfileTab from './ProfileTab.tsx'
import layout from '../layout.module.css'
import ConfirmOwner from './ConfirmOwner.tsx'
import RemoveAccount from './RemoveAccount.tsx'
import SignIn from './SignIn.tsx'
import SignOutEverywhere from './SignOutEverywhere.tsx'
import StandingFacts from './StandingFacts.tsx'
import styles from './AccountPage.module.css'

type Props = {
  account: Account
  /** Every account, for setting auto-confirm rules on many at once. */
  accounts: Account[]
  groups: Group[]
  codesExpireAt: number
  onBack: () => void
  onChanged: () => void
  onRemoved: () => void
}

type Tab = 'profile' | 'playing' | 'security'

// Each is named by the tab's key in the dictionary.
const TABS: Tab[] = ['profile', 'playing', 'security']

type OpenDialog =
  'signIn' | 'reveal' | 'export' | 'remove' | 'rules' | 'signOut' | null

export default function AccountPage({
  account,
  accounts,
  groups,
  codesExpireAt,
  onBack,
  onChanged,
  onRemoved,
}: Props) {
  const t = useT().account
  const [tab, setTab] = useState<Tab>('profile')
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [revocationCode, setRevocationCode] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [biometric, setBiometric] = useState<BiometricMethod | null>(null)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [proxyError, setProxyError] = useState('')
  const [ruleError, setRuleError] = useState('')
  const [groupError, setGroupError] = useState('')
  const [checking, setChecking] = useState(false)
  // `undefined` until Steam was asked, `null` when the account has no key.
  const [apiKey, setApiKey] = useState<ApiKey | null | undefined>(undefined)
  const [checkingKey, setCheckingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [devices, setDevices] = useState<Device[] | undefined>(undefined)
  const [devicesShown, setDevicesShown] = useState(false)
  const [devicesError, setDevicesError] = useState('')
  const [signedOut, setSignedOut] = useState<number | null>(null)
  const [standing, setStanding] = useState<Standing | undefined>(undefined)
  const [standingError, setStandingError] = useState('')
  // `undefined` until Steam was asked, `null` when the account has no wallet.
  const [wallet, setWallet] = useState<Wallet | null | undefined>(undefined)
  const [walletError, setWalletError] = useState('')
  const [checked, setChecked] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const { copy, label } = useCopy()
  const secondsLeft = useCodeSecondsLeft(codesExpireAt)
  const name = account.accountName

  useEffect(() => {
    void biometricStatus().then((status) =>
      setBiometric(status.enrolled ? status.method : null),
    )
    void listProxies().then(setProxies)
  }, [])

  const checkOnOpen = useEffectEvent(() => {
    if (!account.signedIn) return
    void checkKey()
    void loadDevices()
    void loadStanding()
    void loadWallet()
  })
  useEffect(() => checkOnOpen(), [])

  const proxyMissing =
    account.proxyId !== null &&
    !proxies.some((proxy) => proxy.id === account.proxyId)
  const proxyOptions: DropdownOption[] = [
    { value: '', label: t.security.noProxy },
    ...(proxyMissing
      ? [
          {
            value: String(account.proxyId),
            label: t.security.deletedProxy,
            disabled: true,
          },
        ]
      : []),
    ...proxies.map((proxy) => ({
      value: String(proxy.id),
      label: proxyTitle(proxy),
      hint: proxy.name
        ? `${proxy.address} · ${PROXY_KIND_NAMES[proxy.kind]}`
        : PROXY_KIND_NAMES[proxy.kind],
      icon: proxy.country ? <Flag code={proxy.country} /> : undefined,
    })),
  ]

  async function changeProxy(value: string) {
    setProxyError('')
    try {
      await setAccountProxy(name, value === '' ? null : Number(value))
    } catch (err) {
      setProxyError(errorMessage(err))
    }
    onChanged()
  }

  async function changeGroup(value: string) {
    setGroupError('')
    try {
      await setAccountGroup([name], value === '' ? null : Number(value))
    } catch (err) {
      setGroupError(errorMessage(err))
    }
    onChanged()
  }

  async function changeRule(rule: AutoConfirmRule, on: boolean) {
    setRuleError('')
    try {
      await setAutoConfirmRule([name], rule, on)
    } catch (err) {
      setRuleError(errorMessage(err))
    }
    onChanged()
  }

  async function checkSession() {
    setChecking(true)
    setChecked(null)
    try {
      await refreshProfile(name)
      setChecked({ ok: true, text: t.security.sessionAccepted })
    } catch (err) {
      setChecked({ ok: false, text: errorMessage(err) })
    } finally {
      setChecking(false)
      onChanged()
    }
  }

  async function checkKey() {
    setCheckingKey(true)
    setKeyError('')
    try {
      setApiKey(await checkApiKey(name))
    } catch (err) {
      setKeyError(errorMessage(err))
      // The backend drops a session Steam turned down, which the page should show.
      onChanged()
    } finally {
      setCheckingKey(false)
    }
  }

  async function loadDevices() {
    setDevicesError('')
    try {
      setDevices(await listDevices(name))
    } catch (err) {
      setDevicesError(errorMessage(err))
      onChanged()
    }
  }

  async function loadStanding() {
    setStandingError('')
    try {
      setStanding(await checkStanding(name))
    } catch (err) {
      setStandingError(errorMessage(err))
      onChanged()
    }
  }

  async function loadWallet() {
    setWalletError('')
    try {
      setWallet(await walletBalance(name))
    } catch (err) {
      setWalletError(errorMessage(err))
      onChanged()
    }
  }

  async function reveal(password: string | null) {
    setRevocationCode(await revealRevocationCode(name, password))
    setDialog(null)
  }

  async function exportFile(password: string | null) {
    const saved = await exportMaFile(name, password)
    setDialog(null)
    if (saved) setExported(saved)
  }

  return (
    <>
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={onBack}>
          {t.back}
        </button>
        <div className={styles.identity}>
          <Avatar name={name} src={account.avatar} size="lg" />
          <div className={styles.names}>
            <h1 className={layout.title}>{describe(account).title}</h1>
            {describe(account).details ? (
              <span className={styles.steamId} data-private>
                {describe(account).details}
              </span>
            ) : (
              <span className={styles.muted}>{t.importedFromMaFile}</span>
            )}
          </div>
        </div>
      </div>

      {apiKey && !apiKey.trusted && (
        <ApiKeyAlert
          accountName={name}
          apiKey={apiKey}
          onChanged={() => void checkKey()}
        />
      )}

      <section className={styles.section} aria-labelledby="guard-title">
        <h2 id="guard-title" className={styles.sectionTitle}>
          {t.guardTitle}
        </h2>
        <div className={styles.guard}>
          <span className={styles.code} data-private>
            {account.code}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(name, account.code)}
          >
            {label(name, t.copy)}
          </Button>
        </div>
        <span className={layout.bar}>
          <span
            className={layout.barFill}
            style={{ width: `${(secondsLeft / CODE_PERIOD_SECS) * 100}%` }}
          />
        </span>
        <span className={styles.muted}>{t.refreshesIn(secondsLeft)}</span>
      </section>

      <div role="tablist" aria-label={t.sections} className={styles.tabs}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={styles.tab}
            onClick={() => setTab(id)}
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted, so switching tabs doesn't ask Steam again. */}
      <div
        role="tabpanel"
        id="panel-profile"
        aria-labelledby="tab-profile"
        className={styles.panel}
        hidden={tab !== 'profile'}
      >
        <ProfileTab
          accountName={name}
          steamId={account.steamId}
          avatar={account.avatar}
          signedIn={account.signedIn}
          onChanged={onChanged}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-playing"
        aria-labelledby="tab-playing"
        className={styles.panel}
        hidden={tab !== 'playing'}
      >
        <PlayingTab accountName={name} signedIn={account.signedIn} />
      </div>

      <div
        role="tabpanel"
        id="panel-security"
        aria-labelledby="tab-security"
        className={styles.panel}
        hidden={tab !== 'security'}
      >
        <section className={styles.section} aria-label={t.security.title}>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>{t.security.steamSession}</dt>
              <dd className={styles.reveal}>
                <span className={account.signedIn ? undefined : styles.muted}>
                  {account.signedIn
                    ? t.security.signedIn
                    : t.security.notSignedIn}
                </span>
                {account.signedIn ? (
                  <button
                    type="button"
                    className={styles.link}
                    disabled={checking}
                    onClick={() => void checkSession()}
                  >
                    {checking ? t.security.checking : t.security.check}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => setDialog('signIn')}
                  >
                    {t.security.signIn}
                  </button>
                )}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{t.security.webApiKey}</dt>
              {account.signedIn ? (
                <dd className={styles.reveal}>
                  <ApiKeyState apiKey={apiKey} />
                  <button
                    type="button"
                    className={styles.link}
                    disabled={checkingKey}
                    onClick={() => void checkKey()}
                  >
                    {checkingKey ? t.security.checking : t.security.check}
                  </button>
                </dd>
              ) : (
                <dd className={styles.muted}>{t.security.signInToCheck}</dd>
              )}
            </div>
            <div className={styles.fact}>
              <dt>{t.security.activeSessions}</dt>
              {account.signedIn ? (
                <dd className={styles.reveal}>
                  <span className={devices ? undefined : styles.muted}>
                    {devicesSummary(t, devices)}
                  </span>
                  {devices && devices.length > 0 && (
                    <button
                      type="button"
                      className={styles.link}
                      aria-expanded={devicesShown}
                      onClick={() => setDevicesShown(!devicesShown)}
                    >
                      {devicesShown ? t.security.hide : t.security.show}
                    </button>
                  )}
                </dd>
              ) : (
                <dd className={styles.muted}>{t.security.signInToCheck}</dd>
              )}
            </div>
            {devicesShown && devices && (
              <div className={styles.devices}>
                <dt className={styles.hidden}>{t.security.devices}</dt>
                {devices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    accountName={name}
                    device={device}
                    onChanged={() => void loadDevices()}
                  />
                ))}
              </div>
            )}
            <div className={styles.fact}>
              <dt>{t.security.wallet}</dt>
              {account.signedIn ? (
                <dd
                  className={wallet === undefined ? styles.muted : styles.mono}
                  data-private
                >
                  {walletText(t, wallet)}
                </dd>
              ) : (
                <dd className={styles.muted}>{t.security.signInToCheck}</dd>
              )}
            </div>
            <StandingFacts standing={standing} signedIn={account.signedIn} />
            <div className={styles.fact}>
              <dt>{t.security.proxy}</dt>
              <dd>
                <div className={styles.proxyPicker}>
                  <Dropdown
                    label={t.security.proxy}
                    hideLabel
                    size="sm"
                    value={
                      account.proxyId === null ? '' : String(account.proxyId)
                    }
                    options={proxyOptions}
                    onChange={(value) => void changeProxy(value)}
                  />
                </div>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{t.security.group}</dt>
              <dd>
                <div className={styles.proxyPicker}>
                  <Dropdown
                    label={t.security.group}
                    hideLabel
                    size="sm"
                    value={
                      account.groupId === null ? '' : String(account.groupId)
                    }
                    options={[
                      { value: '', label: t.security.noGroup },
                      ...groups.map((group) => ({
                        value: String(group.id),
                        label: group.name,
                      })),
                    ]}
                    onChange={(value) => void changeGroup(value)}
                  />
                </div>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{t.security.note}</dt>
              <NoteField
                accountName={name}
                note={account.note}
                onSaved={onChanged}
              />
            </div>
            <div className={styles.fact}>
              <dt>{t.security.steamId}</dt>
              <dd className={account.steamId ? styles.mono : styles.muted}>
                {account.steamId ?? t.security.appearsAfterSignIn}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{t.security.revocationCode}</dt>
              {account.hasRevocationCode ? (
                <dd className={styles.reveal}>
                  <span className={styles.revocationCode}>
                    {revocationCode ?? 'R•••••'}
                  </span>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() =>
                      revocationCode
                        ? setRevocationCode(null)
                        : setDialog('reveal')
                    }
                  >
                    {revocationCode ? t.security.hide : t.security.show}
                  </button>
                </dd>
              ) : (
                <dd className={styles.muted}>{t.security.notInMaFile}</dd>
              )}
            </div>
            <div className={styles.fact}>
              <dt>{t.security.deviceId}</dt>
              <dd className={account.deviceId ? styles.mono : styles.muted}>
                {account.deviceId || t.security.notInMaFile}
              </dd>
            </div>
          </dl>
          {proxyMissing && (
            <p className={styles.error} role="alert">
              {t.security.proxyDeleted}
            </p>
          )}
          {proxyError && (
            <p className={styles.error} role="alert">
              {proxyError}
            </p>
          )}
          {groupError && (
            <p className={styles.error} role="alert">
              {groupError}
            </p>
          )}
          {walletError && (
            <p className={styles.error} role="alert">
              {walletError}
            </p>
          )}
          {standingError && (
            <p className={styles.error} role="alert">
              {standingError}
            </p>
          )}
          {devicesError && (
            <p className={styles.error} role="alert">
              {devicesError}
            </p>
          )}
          {signedOut !== null && (
            <p className={styles.muted} role="status">
              {signedOut === 0
                ? t.security.noOtherDevice
                : t.security.signedOutDevices(signedOut)}
            </p>
          )}
          {keyError && (
            <p className={styles.error} role="alert">
              {keyError}
            </p>
          )}
          {checked && (
            <p
              className={checked.ok ? styles.muted : styles.error}
              role={checked.ok ? 'status' : 'alert'}
            >
              {checked.text}
            </p>
          )}
          <div className={styles.actions}>
            {account.signedIn && (
              <button
                type="button"
                className={styles.action}
                onClick={() => setDialog('signOut')}
              >
                {t.security.signOutEverywhere}
              </button>
            )}
            <button
              type="button"
              className={styles.action}
              onClick={() => setDialog('export')}
            >
              {t.security.exportMaFile}
            </button>
            <button
              type="button"
              className={`${styles.action} ${styles.danger}`}
              onClick={() => setDialog('remove')}
            >
              {t.security.remove}
            </button>
          </div>
          {exported && (
            <p className={styles.muted} role="status">
              {t.security.saved(exported)}
            </p>
          )}
        </section>

        <section
          className={styles.section}
          aria-labelledby="auto-confirm-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="auto-confirm-title" className={styles.sectionTitle}>
              {t.autoConfirm.title}
            </h2>
            <button
              type="button"
              className={styles.link}
              onClick={() => setDialog('rules')}
            >
              {t.autoConfirm.setForMany}
            </button>
          </div>
          <div className={styles.rules}>
            {AUTO_CONFIRM_RULES.map(({ rule, label, hint, warning }) => (
              <div key={rule} className={styles.rule}>
                <div className={styles.ruleWords}>
                  <span className={styles.ruleLabel}>{label}</span>
                  <span className={styles.ruleHint}>{hint}</span>
                  {warning && account.autoConfirm[rule] && (
                    <span className={styles.ruleWarning}>{warning}</span>
                  )}
                </div>
                <Toggle
                  on={account.autoConfirm[rule]}
                  label={label}
                  onChange={(on) => void changeRule(rule, on)}
                />
              </div>
            ))}
          </div>
          {ruleError && (
            <p className={styles.error} role="alert">
              {ruleError}
            </p>
          )}
          <p className={styles.muted}>
            {!account.signedIn &&
            AUTO_CONFIRM_RULES.some(({ rule }) => account.autoConfirm[rule])
              ? t.autoConfirm.notUntilSignedIn
              : t.autoConfirm.howOften}
          </p>
        </section>
      </div>

      <ConfirmOwner
        open={dialog === 'reveal'}
        title={t.reveal.title}
        text={t.reveal.text}
        action={t.reveal.action}
        biometric={biometric}
        onConfirm={reveal}
        onBiometricsOutdated={() => setBiometric(null)}
        onClose={() => setDialog(null)}
      />
      <ConfirmOwner
        open={dialog === 'export'}
        title={t.exportFile.title}
        text={t.exportFile.text}
        action={t.exportFile.action}
        biometric={biometric}
        onConfirm={exportFile}
        onBiometricsOutdated={() => setBiometric(null)}
        onClose={() => setDialog(null)}
      />
      <SignIn
        open={dialog === 'signIn'}
        accountName={name}
        onClose={() => setDialog(null)}
        onSignedIn={() => {
          setDialog(null)
          void checkSession()
          void checkKey()
          void loadDevices()
          void loadStanding()
        }}
      />
      <SignOutEverywhere
        open={dialog === 'signOut'}
        accountName={name}
        devices={devices}
        onClose={() => setDialog(null)}
        onSignedOut={(count) => {
          setDialog(null)
          setSignedOut(count)
          void loadDevices()
        }}
      />
      <AutoConfirmRules
        open={dialog === 'rules'}
        accounts={accounts}
        groups={groups}
        onClose={() => setDialog(null)}
        onChanged={onChanged}
      />
      <RemoveAccount
        open={dialog === 'remove'}
        account={account}
        onClose={() => setDialog(null)}
        onRemoved={onRemoved}
      />
    </>
  )
}

function ApiKeyState({ apiKey }: { apiKey: ApiKey | null | undefined }) {
  const t = useT().account.security
  if (apiKey === undefined) {
    return <span className={styles.muted}>{t.unknown}</span>
  }
  if (apiKey === null) return <span>{t.none}</span>
  return (
    <span className={apiKey.trusted ? undefined : styles.dangerText}>
      {apiKey.domain}
      {apiKey.trusted && <span className={styles.muted}>{t.yours}</span>}
    </span>
  )
}

type Words = Dictionary['account']

function devicesSummary(t: Words, devices: Device[] | undefined) {
  if (devices === undefined) return t.security.unknown
  const others = devices.filter((device) => !device.thisApp).length
  if (others === 0) return t.security.onlyThisApp
  return t.security.thisAppAnd(others)
}

function walletText(t: Words, wallet: Wallet | null | undefined) {
  if (wallet === undefined) return t.security.unknown
  if (wallet === null) return t.security.noWallet
  const balance = formatMoney(wallet.balance, wallet.currency)
  return wallet.pending > 0
    ? t.security.pending(balance, formatMoney(wallet.pending, wallet.currency))
    : balance
}
