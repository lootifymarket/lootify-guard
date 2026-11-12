import { useState } from 'react'
import { removeAccount, type Account } from '../../../api/accounts.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
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
  return (
    <Dialog
      open={open}
      title={`Remove ${account.accountName}?`}
      onClose={onClose}
    >
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
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const backup = account.hasRevocationCode
    ? 'the .maFile or the revocation code'
    : 'the .maFile'

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
      <p className={dialogStyles.text}>
        The account is removed from this app only. Steam Guard stays on in
        Steam, so without {backup} you lose access to it for good.
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={backedUp}
          onChange={(event) => setBackedUp(event.target.checked)}
        />
        {account.hasRevocationCode
          ? 'I exported the .maFile or saved the revocation code'
          : 'I exported the .maFile'}
      </label>
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
          variant="danger"
          size="sm"
          busy={busy}
          disabled={!backedUp || busy}
          onClick={() => void remove()}
        >
          Remove
        </Button>
      </div>
    </>
  )
}
