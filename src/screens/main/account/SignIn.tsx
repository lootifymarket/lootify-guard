import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { signIn } from '../../../api/accounts.ts'
import { errorMessage, isWrongPassword } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import TextField from '../../../components/TextField.tsx'
import Toggle from '../../../components/Toggle.tsx'
import styles from './AccountPage.module.css'

type Props = {
  open: boolean
  accountName: string
  onClose: () => void
  onSignedIn: () => void
}

export default function SignIn({
  open,
  accountName,
  onClose,
  onSignedIn,
}: Props) {
  const passwordField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title="Sign in to Steam"
      onClose={onClose}
      initialFocus={passwordField}
    >
      <Form
        accountName={accountName}
        passwordField={passwordField}
        onCancel={onClose}
        onSignedIn={onSignedIn}
      />
    </Dialog>
  )
}

function Form({
  accountName,
  passwordField,
  onCancel,
  onSignedIn,
}: {
  accountName: string
  passwordField: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onSignedIn: () => void
}) {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await signIn(accountName, password, remember)
    } catch (err) {
      setError(
        isWrongPassword(err)
          ? 'Steam says the password is wrong'
          : errorMessage(err),
      )
      setBusy(false)
      return
    }
    onSignedIn()
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={dialogStyles.text}>
        Lootify Guard signs in as {accountName} and confirms with this account’s
        Steam Guard code. The password goes only to Steam.
      </p>
      <TextField
        ref={passwordField}
        type="password"
        label="Steam password"
        autoComplete="off"
        value={password}
        invalid={error !== ''}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className={styles.option}>
        <span>Save the password, not just the session</span>
        <Toggle on={remember} label="Save password" onChange={setRemember} />
      </div>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
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
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
