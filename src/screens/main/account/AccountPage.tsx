import { useEffect, useState } from 'react'
import {
  CODE_PERIOD_SECS,
  describe,
  exportMaFile,
  refreshProfile,
  revealRevocationCode,
  setAccountProxy,
  type Account,
} from '../../../api/accounts.ts'
import {
  listProxies,
  PROXY_KIND_NAMES,
  proxyTitle,
  type Proxy,
} from '../../../api/proxies.ts'
import {
  biometricStatus,
  errorMessage,
  type BiometricMethod,
} from '../../../api/vault.ts'
import Avatar from '../../../components/Avatar.tsx'
import Button from '../../../components/Button.tsx'
import Dropdown, { type DropdownOption } from '../../../components/Dropdown.tsx'
import Flag from '../../../components/Flag.tsx'
import { useCopy } from '../../../lib/useCopy.ts'
import { useCodeSecondsLeft } from '../useAccounts.ts'
import layout from '../layout.module.css'
import ConfirmOwner from './ConfirmOwner.tsx'
import RemoveAccount from './RemoveAccount.tsx'
import SignIn from './SignIn.tsx'
import styles from './AccountPage.module.css'

type Props = {
  account: Account
  codesExpireAt: number
  onBack: () => void
  onChanged: () => void
  onRemoved: () => void
}

type OpenDialog = 'signIn' | 'reveal' | 'export' | 'remove' | null

export default function AccountPage({
  account,
  codesExpireAt,
  onBack,
  onChanged,
  onRemoved,
}: Props) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [revocationCode, setRevocationCode] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [biometric, setBiometric] = useState<BiometricMethod | null>(null)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [proxyError, setProxyError] = useState('')
  const [checking, setChecking] = useState(false)
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

      <section className={styles.section} aria-labelledby="security-title">
        <h2 id="security-title" className={styles.sectionTitle}>
          Security
        </h2>
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
        {checked && (
          <p
            className={checked.ok ? styles.muted : styles.error}
            role={checked.ok ? 'status' : 'alert'}
          >
            {checked.text}
          </p>
        )}
        <div className={styles.actions}>
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
        }}
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
