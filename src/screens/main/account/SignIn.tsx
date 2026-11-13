import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { signIn } from '../../../api/accounts.ts'
import { errorMessage, isWrongPassword } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
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
  const t = useT().account.signIn
  const passwordField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title={t.title}
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
  const words = useT()
  const t = words.account.signIn
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
      setError(isWrongPassword(err) ? t.wrongPassword : errorMessage(err))
      setBusy(false)
      return
    }
    onSignedIn()
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={dialogStyles.text}>{t.text(accountName)}</p>
      <TextField
        ref={passwordField}
        type="password"
        label={t.password}
        autoComplete="off"
        value={password}
        invalid={error !== ''}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className={styles.option}>
        <span>{t.savePassword}</span>
        <Toggle
          on={remember}
          label={t.savePasswordLabel}
          onChange={setRemember}
        />
      </div>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {words.common.cancel}
        </Button>
        <Button
          type="submit"
          size="sm"
          busy={busy}
          disabled={!password || busy}
        >
          {busy ? t.signingIn : t.signIn}
        </Button>
      </div>
    </form>
  )
}
