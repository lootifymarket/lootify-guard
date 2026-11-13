import { useState } from 'react'
import { signOutOtherDevices } from '../../../api/security.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'

type Props = {
  open: boolean
  accountName: string
  onClose: () => void
  onSignedOut: (count: number) => void
}

export default function SignOutEverywhere({
  open,
  accountName,
  onClose,
  onSignedOut,
}: Props) {
  return (
    <Dialog open={open} title="Sign out everywhere?" onClose={onClose}>
      <Form
        accountName={accountName}
        onCancel={onClose}
        onSignedOut={onSignedOut}
      />
    </Dialog>
  )
}

function Form({
  accountName,
  onCancel,
  onSignedOut,
}: {
  accountName: string
  onCancel: () => void
  onSignedOut: (count: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    setBusy(true)
    setError('')
    let count: number
    try {
      count = await signOutOtherDevices(accountName)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onSignedOut(count)
  }

  return (
    <>
      <p className={dialogStyles.text}>
        Steam ends every session except this app. The Steam app on phones, Steam
        on computers and browsers will ask to sign in again.
      </p>
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
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => void signOut()}
        >
          {busy ? 'Signing out…' : 'Sign out everywhere'}
        </Button>
      </div>
    </>
  )
}
