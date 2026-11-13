import { useState } from 'react'
import { removeAccount, type Account } from '../../../api/accounts.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import styles from './AccountPage.module.css'

type Props = {
  open: boolean
  account: Account
  onClose: () => void
  onRemoved: () => void
}

export default function RemoveAccount({
  open,
  account,
  onClose,
  onRemoved,
}: Props) {
  const t = useT().account.remove
  return (
    <Dialog open={open} title={t.title(account.accountName)} onClose={onClose}>
      <Form account={account} onCancel={onClose} onRemoved={onRemoved} />
    </Dialog>
  )
}

function Form({
  account,
  onCancel,
  onRemoved,
}: {
  account: Account
  onCancel: () => void
  onRemoved: () => void
}) {
  const words = useT()
  const t = words.account.remove
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await removeAccount(account.accountName)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onRemoved()
  }

  return (
    <>
      <p className={dialogStyles.text}>{t.text(account.hasRevocationCode)}</p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={backedUp}
          onChange={(event) => setBackedUp(event.target.checked)}
        />
        {t.backedUp(account.hasRevocationCode)}
      </label>
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
          variant="danger"
          size="sm"
          busy={busy}
          disabled={!backedUp || busy}
          onClick={() => void remove()}
        >
          {t.remove}
        </Button>
      </div>
    </>
  )
}
