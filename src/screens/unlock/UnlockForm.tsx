import { useState, type FormEvent } from 'react'
import {
  errorMessage,
  isBiometricsOutdated,
  isCancelled,
  unlockVault,
  unlockWithBiometrics,
} from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import TextField from '../../components/TextField.tsx'
import styles from './Unlock.module.css'

type Props = {
  biometricName: string | null
  onUnlocked: () => void
  onForgot: () => void
  onBiometricsOutdated: () => void
}

export default function UnlockForm({
  biometricName,
  onUnlocked,
  onForgot,
  onBiometricsOutdated,
}: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'password' | 'biometric' | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!password) {
      setError('Enter your password')
      return
    }
    setBusy('password')
    setError('')
    try {
      await unlockVault(password)
      onUnlocked()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  async function unlockWithBiometric() {
    if (busy) return
    setBusy('biometric')
    setError('')
    try {
      await unlockWithBiometrics()
      onUnlocked()
    } catch (err) {
      if (!isCancelled(err)) setError(errorMessage(err))
      if (isBiometricsOutdated(err)) onBiometricsOutdated()
      setBusy(null)
    }
  }

  return (
    <form className={styles.view} onSubmit={submit}>
      <p className={styles.subtitle}>
        {busy
          ? 'Decrypting your vault…'
          : 'Enter your master password to open the vault.'}
      </p>
      <TextField
        type="password"
        label="Master password"
        hideLabel
        placeholder="Master password"
        autoComplete="current-password"
        autoFocus
        value={password}
        invalid={Boolean(error)}
        onChange={(event) => {
          setPassword(event.target.value)
          setError('')
        }}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button type="submit" busy={busy === 'password'} className={styles.wide}>
        {busy === 'password' ? 'Opening…' : 'Unlock'}
      </Button>
      {biometricName && (
        <Button
          variant="secondary"
          busy={busy === 'biometric'}
          className={`${styles.wide} ${styles.biometric}`}
          onClick={() => void unlockWithBiometric()}
        >
          Unlock with {biometricName}
        </Button>
      )}
      <button
        type="button"
        className={`${styles.link} ${styles.forgot}`}
        onClick={onForgot}
      >
        Forgot password?
      </button>
    </form>
  )
}
