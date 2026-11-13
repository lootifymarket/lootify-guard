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
import { useCopy } from '../../../lib/useCopy.ts'
import { useCodeSecondsLeft } from '../useAccounts.ts'
import AutoConfirmRules from '../AutoConfirmRules.tsx'
import ApiKeyAlert from './ApiKeyAlert.tsx'
import DeviceRow from './DeviceRow.tsx'
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

type Tab = 'profile' | 'security'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
]

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
    { value: '', label: 'No proxy' },
    ...(proxyMissing
      ? [
          {
            value: String(account.proxyId),
            label: 'Deleted proxy',
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
      setChecked({ ok: true, text: 'Steam accepted the session.' })
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
          ← Accounts
        </button>
        <div className={styles.identity}>
          <Avatar name={name} src={account.avatar} size="lg" />
          <div className={styles.names}>
            <h1 className={layout.title}>{describe(account).title}</h1>
            {describe(account).details ? (
              <span className={styles.steamId}>
                {describe(account).details}
              </span>
            ) : (
              <span className={styles.muted}>Imported from .maFile</span>
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
          Steam Guard
        </h2>
        <div className={styles.guard}>
          <span className={styles.code}>{account.code}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(name, account.code)}
          >
            {label(name, 'Copy')}
          </Button>
        </div>
        <span className={layout.bar}>
          <span
            className={layout.barFill}
            style={{ width: `${(secondsLeft / CODE_PERIOD_SECS) * 100}%` }}
          />
        </span>
        <span className={styles.muted}>Refreshes in {secondsLeft} s</span>
      </section>

      <div role="tablist" aria-label="Sections" className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            className={styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
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
        id="panel-security"
        aria-labelledby="tab-security"
        className={styles.panel}
        hidden={tab !== 'security'}
      >
        <section className={styles.section} aria-label="Security">
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Steam session</dt>
              <dd className={styles.reveal}>
                <span className={account.signedIn ? undefined : styles.muted}>
                  {account.signedIn ? 'Signed in' : 'Not signed in'}
                </span>
                {account.signedIn ? (
                  <button
                    type="button"
                    className={styles.link}
                    disabled={checking}
                    onClick={() => void checkSession()}
                  >
                    {checking ? 'Checking…' : 'Check'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => setDialog('signIn')}
                  >
                    Sign in
                  </button>
                )}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Web API key</dt>
              {account.signedIn ? (
                <dd className={styles.reveal}>
                  <ApiKeyState apiKey={apiKey} />
                  <button
                    type="button"
                    className={styles.link}
                    disabled={checkingKey}
                    onClick={() => void checkKey()}
                  >
                    {checkingKey ? 'Checking…' : 'Check'}
                  </button>
                </dd>
              ) : (
                <dd className={styles.muted}>Sign in to check</dd>
              )}
            </div>
            <div className={styles.fact}>
              <dt>Active sessions</dt>
              {account.signedIn ? (
                <dd className={styles.reveal}>
                  <span className={devices ? undefined : styles.muted}>
                    {devicesSummary(devices)}
                  </span>
                  {devices && devices.length > 0 && (
                    <button
                      type="button"
                      className={styles.link}
                      aria-expanded={devicesShown}
                      onClick={() => setDevicesShown(!devicesShown)}
                    >
                      {devicesShown ? 'Hide' : 'Show'}
                    </button>
                  )}
                </dd>
              ) : (
                <dd className={styles.muted}>Sign in to check</dd>
              )}
            </div>
            {devicesShown && devices && (
              <div className={styles.devices}>
                <dt className={styles.hidden}>Devices</dt>
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
              <dt>Wallet</dt>
              {account.signedIn ? (
                <dd
                  className={wallet === undefined ? styles.muted : styles.mono}
                >
                  {walletText(wallet)}
                </dd>
              ) : (
                <dd className={styles.muted}>Sign in to check</dd>
              )}
            </div>
            <StandingFacts standing={standing} signedIn={account.signedIn} />
            <div className={styles.fact}>
              <dt>Proxy</dt>
              <dd>
                <div className={styles.proxyPicker}>
                  <Dropdown
                    label="Proxy"
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
              <dt>Group</dt>
              <dd>
                <div className={styles.proxyPicker}>
                  <Dropdown
                    label="Group"
                    hideLabel
                    size="sm"
                    value={
                      account.groupId === null ? '' : String(account.groupId)
                    }
                    options={[
                      { value: '', label: 'No group' },
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
              <dt>Steam ID</dt>
              <dd className={account.steamId ? styles.mono : styles.muted}>
                {account.steamId ?? 'Appears after you sign in'}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Revocation code</dt>
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
                    {revocationCode ? 'Hide' : 'Show'}
                  </button>
                </dd>
              ) : (
                <dd className={styles.muted}>Not in the .maFile</dd>
              )}
            </div>
            <div className={styles.fact}>
              <dt>Device ID</dt>
              <dd className={account.deviceId ? styles.mono : styles.muted}>
                {account.deviceId || 'Not in the .maFile'}
              </dd>
            </div>
          </dl>
          {proxyMissing && (
            <p className={styles.error} role="alert">
              This account’s proxy was deleted. It can’t reach Steam until you
              pick another proxy or No proxy.
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
                ? 'No other device was signed in.'
                : `Signed out ${signedOut} ${signedOut === 1 ? 'device' : 'devices'}.`}
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
                Sign out everywhere
              </button>
            )}
            <button
              type="button"
              className={styles.action}
              onClick={() => setDialog('export')}
            >
              Export .maFile
            </button>
            <button
              type="button"
              className={`${styles.action} ${styles.danger}`}
              onClick={() => setDialog('remove')}
            >
              Remove from Lootify Guard
            </button>
          </div>
          {exported && (
            <p className={styles.muted} role="status">
              Saved {exported}
            </p>
          )}
        </section>

        <section
          className={styles.section}
          aria-labelledby="auto-confirm-title"
        >
          <div className={styles.sectionHead}>
            <h2 id="auto-confirm-title" className={styles.sectionTitle}>
              Auto-confirm
            </h2>
            <button
              type="button"
              className={styles.link}
              onClick={() => setDialog('rules')}
            >
              Set for many accounts
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
              ? 'Nothing is confirmed until the account is signed in to Steam.'
              : 'Checked every minute while the vault is unlocked. API keys, phone changes and account recovery are never confirmed automatically.'}
          </p>
        </section>
      </div>

      <ConfirmOwner
        open={dialog === 'reveal'}
        title="Show revocation code"
        text="The code removes Steam Guard from the account. Confirm it’s you first."
        action="Show"
        biometric={biometric}
        onConfirm={reveal}
        onBiometricsOutdated={() => setBiometric(null)}
        onClose={() => setDialog(null)}
      />
      <ConfirmOwner
        open={dialog === 'export'}
        title="Export .maFile"
        text="The file holds this account’s Steam Guard secrets unencrypted. Anyone who gets it can sign in with its codes and confirm trades. Keep it where only you can reach it."
        action="Save file…"
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
  if (apiKey === undefined) return <span className={styles.muted}>Unknown</span>
  if (apiKey === null) return <span>None</span>
  return (
    <span className={apiKey.trusted ? undefined : styles.dangerText}>
      {apiKey.domain}
      {apiKey.trusted && <span className={styles.muted}> · yours</span>}
    </span>
  )
}

function devicesSummary(devices: Device[] | undefined) {
  if (devices === undefined) return 'Unknown'
  const others = devices.filter((device) => !device.thisApp).length
  if (others === 0) return 'Only this app'
  return `This app and ${others} ${others === 1 ? 'other device' : 'other devices'}`
}

function walletText(wallet: Wallet | null | undefined) {
  if (wallet === undefined) return 'Unknown'
  if (wallet === null) return 'No wallet'
  const balance = formatMoney(wallet.balance, wallet.currency)
  return wallet.pending > 0
    ? `${balance} · ${formatMoney(wallet.pending, wallet.currency)} pending`
    : balance
}
