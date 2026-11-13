import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { allowQrSignIn } from '../../api/signIns.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import Dropdown from '../../components/Dropdown.tsx'
import QrScanner from '../../components/QrScanner.tsx'
import TextField from '../../components/TextField.tsx'
import { useT } from '../../i18n/index.ts'
import styles from './SignInRequests.module.css'

const STEAM_QR_LINK = /^https:\/\/s\.team\/q\/\d+\/\d+$/

type Props = {
  open: boolean
  accountNames: string[]
  onClose: () => void
  onAllowed: (accountName: string) => void
}

export default function QrSignIn({
  open,
  accountNames,
  onClose,
  onAllowed,
}: Props) {
  const t = useT().guard.qr
  const linkField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title={t.title}
      onClose={onClose}
      initialFocus={linkField}
    >
      <Form
        accountNames={accountNames}
        linkField={linkField}
        onCancel={onClose}
        onAllowed={onAllowed}
      />
    </Dialog>
  )
}

function Form({
  accountNames,
  linkField,
  onCancel,
  onAllowed,
}: {
  accountNames: string[]
  linkField: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onAllowed: (accountName: string) => void
}) {
  const words = useT()
  const t = words.guard.qr
  const [link, setLink] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState('')
  const [accountName, setAccountName] = useState(accountNames[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function scanned(text: string) {
    // Any QR code in view is read; only a Steam sign-in one is taken.
    if (STEAM_QR_LINK.test(text.trim())) {
      setLink(text.trim())
      setScanning(false)
      setScanNote('')
      setError('')
    } else {
      setScanNote(t.notSteam)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!link.trim() || !accountName || busy) return
    setBusy(true)
    setError('')
    try {
      await allowQrSignIn(accountName, link)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onAllowed(accountName)
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={dialogStyles.text}>{t.intro}</p>
      {scanning ? (
        <>
          <QrScanner onScan={scanned} />
          {scanNote && <span className={styles.failure}>{scanNote}</span>}
        </>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className={styles.scanButton}
          onClick={() => setScanning(true)}
        >
          {t.scan}
        </Button>
      )}
      <TextField
        ref={linkField}
        label={t.link}
        placeholder="https://s.team/q/…"
        autoComplete="off"
        spellCheck={false}
        value={link}
        invalid={error !== ''}
        onChange={(event) => setLink(event.target.value)}
      />
      <Dropdown
        label={t.account}
        value={accountName}
        options={accountNames.map((name) => ({ value: name, label: name }))}
        onChange={setAccountName}
      />
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
          disabled={!link.trim() || !accountName || busy}
        >
          {t.allow}
        </Button>
      </div>
    </form>
  )
}
