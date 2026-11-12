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
        <h1 className={styles.title}>Reset your password</h1>
        <p className={styles.text}>
          {biometricName} is turned on for this vault. Confirm it’s you, then
          choose a new master password.
        </p>
      </div>
      {verified ? (
        <div className={styles.newPassword}>
          <span className={styles.verified}>Verified with {biometricName}</span>
          <TextField
            type="password"
            label="New master password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            type="password"
            label="Repeat password"
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
              ? '12+ characters recommended'
              : mismatch
                ? 'Passwords don’t match'
                : weak
                  ? 'Weak: easy to crack if the vault file is stolen'
                  : canSave
                    ? 'Looks good'
                    : 'Repeat the password'}
          </span>
          <Button
            type="submit"
            busy={busy}
            disabled={!canSave}
            className={styles.wide}
          >
            {busy ? 'Re-encrypting vault…' : 'Save and unlock'}
          </Button>
        </div>
      ) : (
        <Button
          busy={busy}
          className={styles.wide}
          onClick={() => void verify()}
        >
          {busy
            ? `Waiting for ${biometricName}…`
            : `Verify with ${biometricName}`}
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
          ← Back
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => void leave(onUnavailable)}
        >
          {biometricName} isn’t available
        </button>
      </div>
    </form>
  )
}
