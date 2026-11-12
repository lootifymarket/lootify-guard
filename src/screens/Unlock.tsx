import { useState, type FormEvent } from 'react'
import { errorMessage, isWrongPassword, unlockVault } from '../api/vault.ts'
import Button from '../components/Button.tsx'
import Lockup from '../components/Lockup.tsx'
import PasswordField from '../components/PasswordField.tsx'
import styles from './Unlock.module.css'

type Props = {
  onUnlocked: () => void
}

export default function Unlock({ onUnlocked }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!password) {
      setError('Enter your password')
      return
    }
    setBusy(true)
    setError('')
    try {
      await unlockVault(password)
      onUnlocked()
    } catch (err) {
      setError(isWrongPassword(err) ? 'Wrong password' : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <Lockup />
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.subtitle}>
            {busy
              ? 'Decrypting your vault…'
              : 'Enter your master password to open the vault.'}
          </p>
          <PasswordField
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
          <Button type="submit" busy={busy} className={styles.submit}>
            {busy ? 'Opening…' : 'Unlock'}
          </Button>
        </form>
        <p className={styles.footnote}>
          Your data is encrypted and stored only on this device.
        </p>
      </div>
    </div>
  )
}
