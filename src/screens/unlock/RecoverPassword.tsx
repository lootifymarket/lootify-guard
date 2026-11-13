import { useState, type FormEvent } from 'react'
import {
  changePassword,
  errorMessage,
  isBiometricsOutdated,
  isCancelled,
  lockVault,
  unlockWithBiometrics,
} from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import TextField from '../../components/TextField.tsx'
import { useT } from '../../i18n/index.ts'
import styles from './Unlock.module.css'

type Props = {
  biometricName: string
  onUnlocked: () => void
  onBack: () => void
  onUnavailable: () => void
  onBiometricsOutdated: () => void
}

export default function RecoverPassword({
  biometricName,
  onUnlocked,
  onBack,
  onUnavailable,
  onBiometricsOutdated,
}: Props) {
  const words = useT()
  const t = words.unlock
  const [verified, setVerified] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const mismatch = repeat.length > 0 && repeat !== password
  const weak = password.length > 0 && password.length < 12
  const canSave = password.length > 0 && repeat === password

  async function verify() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await unlockWithBiometrics()
      setVerified(true)
    } catch (err) {
      if (!isCancelled(err)) setError(errorMessage(err))
      if (isBiometricsOutdated(err)) onBiometricsOutdated()
    }
    setBusy(false)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!verified || !canSave || busy) return
    setBusy(true)
    setError('')
    try {
      await changePassword(password)
      onUnlocked()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  // Verifying opens the vault, so walking away from this screen has to close it again.
  async function leave(next: () => void) {
    if (verified) await lockVault()
    next()
  }

  return (
    <form className={`${styles.view} ${styles.recover}`} onSubmit={save}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{t.recoverTitle}</h1>
        <p className={styles.text}>{t.recoverText(biometricName)}</p>
      </div>
      {verified ? (
        <div className={styles.newPassword}>
          <span className={styles.verified}>
            {t.verifiedWith(biometricName)}
          </span>
          <TextField
            type="password"
            label={t.newPassword}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            type="password"
            label={t.repeatPassword}
            autoComplete="new-password"
            value={repeat}
            invalid={mismatch}
            onChange={(event) => setRepeat(event.target.value)}
          />
          <span
            className={styles.hint}
            data-tone={mismatch || weak ? 'danger' : 'faint'}
          >
            {!password
              ? t.recommended
              : mismatch
                ? t.mismatch
                : weak
                  ? t.weak
                  : canSave
                    ? t.looksGood
                    : t.repeat}
          </span>
          <Button
            type="submit"
            busy={busy}
            disabled={!canSave}
            className={styles.wide}
          >
            {busy ? t.reencrypting : t.saveAndUnlock}
          </Button>
        </div>
      ) : (
        <Button
          busy={busy}
          className={styles.wide}
          onClick={() => void verify()}
        >
          {busy ? t.waitingFor(biometricName) : t.verifyWith(biometricName)}
        </Button>
      )}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <div className={styles.recoverLinks}>
        <button
          type="button"
          className={styles.back}
          onClick={() => void leave(onBack)}
        >
          ← {words.common.back}
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => void leave(onUnavailable)}
        >
          {t.unavailable(biometricName)}
        </button>
      </div>
    </form>
  )
}
