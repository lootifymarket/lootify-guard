import { useState, type FormEvent } from 'react'
import {
  eraseVault,
  errorMessage,
  isWrongPassword,
  unlockVault,
} from '../api/vault.ts'
import Button from '../components/Button.tsx'
import Lockup from '../components/Lockup.tsx'
import TextField from '../components/TextField.tsx'
import styles from './Unlock.module.css'

const RECOVERY_WAYS = [
  {
    title: 'Restore from a backup',
    text: 'Import your .maFile files or a vault backup made in Settings.',
  },
  {
    title: 'Use Steam revocation codes',
    text: 'Each R-code removes Steam Guard from its account. Then add the account again.',
  },
  {
    title: 'Contact Steam Support',
    text: 'For accounts with neither a backup nor an R-code.',
  },
]

type Props = {
  onUnlocked: () => void
  onErased: () => void
}

export default function Unlock({ onUnlocked, onErased }: Props) {
  const [view, setView] = useState<'unlock' | 'reset'>('unlock')

  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <Lockup />
        {view === 'unlock' ? (
          <UnlockForm
            onUnlocked={onUnlocked}
            onForgot={() => setView('reset')}
          />
        ) : (
          <ResetVault onErased={onErased} onBack={() => setView('unlock')} />
        )}
        <p className={styles.footnote}>
          Your data is encrypted and stored only on this device.
        </p>
      </div>
    </div>
  )
}

function UnlockForm({
  onUnlocked,
  onForgot,
}: {
  onUnlocked: () => void
  onForgot: () => void
}) {
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
      <Button type="submit" busy={busy} className={styles.wide}>
        {busy ? 'Opening…' : 'Unlock'}
      </Button>
      <button type="button" className={styles.forgot} onClick={onForgot}>
        Forgot password?
      </button>
    </form>
  )
}

function ResetVault({
  onErased,
  onBack,
}: {
  onErased: () => void
  onBack: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmed = confirmation.trim().toUpperCase() === 'RESET'

  async function erase(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    setError('')
    try {
      await eraseVault()
      onErased()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className={`${styles.view} ${styles.reset}`} onSubmit={erase}>
      <div className={styles.heading}>
        <h1 className={styles.title}>The vault can’t be opened</h1>
        <p className={styles.text}>
          Without the password nobody can decrypt it, not even us. That’s the
          point of the encryption. Erase it and start over; your Steam accounts
          aren’t lost.
        </p>
      </div>
      <div className={styles.ways}>
        <span className={styles.waysTitle}>
          Getting your accounts back after a reset
        </span>
        <ol className={styles.wayList}>
          {RECOVERY_WAYS.map((way) => (
            <li key={way.title} className={styles.way}>
              <span className={styles.wayTitle}>{way.title}</span>
              <span className={styles.wayText}>{way.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <TextField
        label="Type RESET to erase this vault"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        className={styles.confirmation}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button
        type="submit"
        variant="danger"
        busy={busy}
        disabled={!confirmed}
        className={styles.wide}
      >
        {busy ? 'Erasing…' : 'Erase vault and start over'}
      </Button>
      <button type="button" className={styles.back} onClick={onBack}>
        ← I remembered it
      </button>
    </form>
  )
}
