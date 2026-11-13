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
import { useT } from '../../../i18n/index.ts'
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
  const t = useT().changePassword
  return (
    <Dialog open={props.open} title={t.title} onClose={props.onClose}>
      {props.open && <Form {...props} />}
    </Dialog>
  )
}

function Form({ biometricName, onClose, onChanged }: Props) {
  const words = useT()
  const t = words.changePassword
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
      setError(isWrongPassword(err) ? t.wrongCurrent : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <TextField
        type="password"
        label={t.current}
        autoComplete="current-password"
        autoFocus
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        type="password"
        label={t.new}
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <TextField
        type="password"
        label={t.repeat}
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
          ? t.mismatch
          : password && !strong
            ? t.weak
            : biometricName
              ? t.movesBiometric(biometricName)
              : t.reencrypted}
      </p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {words.common.cancel}
        </Button>
        <Button type="submit" size="sm" busy={busy} disabled={!canSave}>
          {busy ? t.reencrypting : words.common.save}
        </Button>
      </div>
    </form>
  )
}
