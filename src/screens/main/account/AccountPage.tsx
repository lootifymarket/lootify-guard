import { useEffect, useState } from 'react'
import {
  CODE_PERIOD_SECS,
  exportMaFile,
  revealRevocationCode,
  type Account,
} from '../../../api/accounts.ts'
import { biometricStatus, type BiometricMethod } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useCopy } from '../../../lib/useCopy.ts'
import { useSecondsLeft } from '../useAccounts.ts'
import layout from '../layout.module.css'
import ConfirmOwner from './ConfirmOwner.tsx'
import RemoveAccount from './RemoveAccount.tsx'
import styles from './AccountPage.module.css'

type Props = {
  account: Account
  codesExpireAt: number
  onBack: () => void
  onRemoved: () => void
}

type OpenDialog = 'reveal' | 'export' | 'remove' | null

export default function AccountPage({
  account,
  codesExpireAt,
  onBack,
  onRemoved,
}: Props) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [revocationCode, setRevocationCode] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [biometric, setBiometric] = useState<BiometricMethod | null>(null)
  const { copy, label } = useCopy()
  const secondsLeft = useSecondsLeft(codesExpireAt)
  const name = account.accountName

  useEffect(() => {
    void biometricStatus().then((status) =>
      setBiometric(status.enrolled ? status.method : null),
    )
  }, [])

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
          <span className={styles.avatar} aria-hidden="true">
            {name.slice(0, 2).toUpperCase()}
          </span>
          <div className={styles.names}>
            <h1 className={layout.title}>{name}</h1>
            <span className={account.steamId ? styles.steamId : styles.muted}>
              {account.steamId ?? 'Imported from .maFile'}
            </span>
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
            <dt>Steam ID</dt>
            <dd className={account.steamId ? styles.mono : styles.muted}>
              {account.steamId ?? 'Not in the .maFile'}
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
      <RemoveAccount
        open={dialog === 'remove'}
        account={account}
        onClose={() => setDialog(null)}
        onRemoved={onRemoved}
      />
    </>
  )
}
