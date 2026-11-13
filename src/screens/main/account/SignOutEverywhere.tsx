import { useState } from 'react'
import { signOutOtherDevices, type Device } from '../../../api/security.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import DeviceDetails from './DeviceDetails.tsx'
import styles from './AccountPage.module.css'

type Props = {
  open: boolean
  accountName: string
  /** `undefined` when the list couldn't be loaded. */
  devices: Device[] | undefined
  onClose: () => void
  onSignedOut: (count: number) => void
}

export default function SignOutEverywhere({
  open,
  accountName,
  devices,
  onClose,
  onSignedOut,
}: Props) {
  const t = useT().account.signOut
  return (
    <Dialog open={open} title={t.title} onClose={onClose}>
      <Form
        accountName={accountName}
        others={devices?.filter((device) => !device.thisApp)}
        onCancel={onClose}
        onSignedOut={onSignedOut}
      />
    </Dialog>
  )
}

function Form({
  accountName,
  others,
  onCancel,
  onSignedOut,
}: {
  accountName: string
  others: Device[] | undefined
  onCancel: () => void
  onSignedOut: (count: number) => void
}) {
  const words = useT()
  const t = words.account.signOut
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
        {others?.length === 0 ? t.nothingElse : t.others}
      </p>
      {others && others.length > 0 && (
        <ul className={styles.signOutList}>
          {others.map((device) => (
            <li key={device.id} className={styles.device}>
              <DeviceDetails device={device} />
            </li>
          ))}
        </ul>
      )}
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
          size="sm"
          busy={busy}
          disabled={busy || others?.length === 0}
          onClick={() => void signOut()}
        >
          {busy ? t.signingOut : t.signOut}
        </Button>
      </div>
    </>
  )
}
