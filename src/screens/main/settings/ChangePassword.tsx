import { useState, type FormEvent } from 'react'
import {
  changeMasterPassword,
  errorMessage,
  isWrongPassword,
} from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import TextField from '../../../components/TextField.tsx'
import { checkPassword } from '../../../lib/passwordStrength.ts'
import styles from './Settings.module.css'

type Props = {
  open: boolean
  /** Set when biometric unlock is on, which moves to the new password. */
  biometricName: string | null
  onClose: () => void
  onChanged: () => void
}

export default function ChangePassword(props: Props) {
  return (
    <Dialog
      open={props.open}
      title="Change master password"
      onClose={props.onClose}
    >
      {props.open && <Form {...props} />}
    </Dialog>
  )
}

function Form({ biometricName, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { strong } = checkPassword(password)
  const mismatch = repeat.length > 0 && repeat !== password
  const canSave =
    current.length > 0 && password.length > 0 && repeat === password

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    setError('')
    try {
      await changeMasterPassword(current, password)
      onChanged()
    } catch (err) {
      setError(
        isWrongPassword(err)
          ? 'The current password is wrong'
          : errorMessage(err),
      )
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <TextField
        type="password"
        label="Current password"
        autoComplete="current-password"
        autoFocus
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        type="password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <TextField
        type="password"
        label="Repeat new password"
        autoComplete="new-password"
        value={repeat}
        invalid={mismatch}
        onChange={(event) => setRepeat(event.target.value)}
      />
      <p
        className={styles.hint}
        data-tone={mismatch || (password && !strong) ? 'danger' : undefined}
      >
        {mismatch
          ? 'Passwords don’t match'
          : password && !strong
            ? 'Weak: use 12+ characters, mixed case and a number or symbol'
            : biometricName
              ? `The vault is re-encrypted, and ${biometricName} moves to the new password.`
              : 'The vault is re-encrypted with the new password.'}
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" busy={busy} disabled={!canSave}>
          {busy ? 'Re-encrypting…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
