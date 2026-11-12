import { useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  BIOMETRIC_NAMES,
  errorMessage,
  isBiometricsOutdated,
  isCancelled,
  type BiometricMethod,
} from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import TextField from '../../../components/TextField.tsx'
import styles from './AccountPage.module.css'

type FormProps = {
  text: string
  action: string
  biometric: BiometricMethod | null
  /** Gets the password, or `null` when the user picked biometrics. */
  onConfirm: (password: string | null) => Promise<void>
  onBiometricsOutdated: () => void
}

type Props = FormProps & {
  open: boolean
  title: string
  onClose: () => void
}

/** Asks for the master password or biometrics again before secrets are shown. */
export default function ConfirmOwner({ open, title, onClose, ...form }: Props) {
  const passwordField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      initialFocus={passwordField}
    >
      <Form {...form} passwordField={passwordField} onCancel={onClose} />
    </Dialog>
  )
}

function Form({
  text,
  action,
  biometric,
  onConfirm,
  onBiometricsOutdated,
  passwordField,
  onCancel,
}: FormProps & {
  passwordField: RefObject<HTMLInputElement | null>
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm(withPassword: string | null) {
    setBusy(true)
    setError('')
    try {
      await onConfirm(withPassword)
    } catch (err) {
      if (isBiometricsOutdated(err)) onBiometricsOutdated()
      if (!isCancelled(err)) setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (password && !busy) void confirm(password)
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={dialogStyles.text}>{text}</p>
      <TextField
        ref={passwordField}
        type="password"
        label="Master password"
        autoComplete="current-password"
        value={password}
        invalid={error !== ''}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        {biometric && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void confirm(null)}
          >
            Use {BIOMETRIC_NAMES[biometric]}
          </Button>
        )}
        <div className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            busy={busy}
            disabled={!password || busy}
          >
            {action}
          </Button>
        </div>
      </div>
    </form>
  )
}
