import { useState, type FormEvent } from 'react'
import {
  nameDevice,
  signOutDevice,
  type Device,
} from '../../../api/security.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
import TextField from '../../../components/TextField.tsx'
import DeviceDetails from './DeviceDetails.tsx'
import styles from './AccountPage.module.css'

type Props = {
  accountName: string
  device: Device
  /** The device was renamed or signed out, so the list is out of date. */
  onChanged: () => void
}

/** A signed-in device with ways to name it here or sign it out of the account. */
export default function DeviceRow({ accountName, device, onChanged }: Props) {
  const words = useT()
  const t = words.account.device
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    setBusy(false)
    setEditing(false)
    onChanged()
  }

  function save(event: FormEvent) {
    event.preventDefault()
    void run(() => nameDevice(accountName, device.id, name))
  }

  return (
    <dd className={styles.device}>
      {editing ? (
        <form className={styles.rename} onSubmit={save}>
          <TextField
            label={t.nameFor(device.name || null)}
            hideLabel
            autoFocus
            placeholder={device.name || t.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" busy={busy} disabled={busy}>
            {words.common.save}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(false)}
          >
            {words.common.cancel}
          </Button>
        </form>
      ) : (
        <DeviceDetails device={device}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setName(device.label ?? '')
              setEditing(true)
            }}
          >
            {t.rename}
          </button>
          {!device.thisApp && (
            <button
              type="button"
              className={styles.link}
              disabled={busy}
              onClick={() =>
                void run(() => signOutDevice(accountName, device.id))
              }
            >
              {busy ? t.signingOut : t.signOut}
            </button>
          )}
        </DeviceDetails>
      )}
      {error && (
        <span className={styles.deviceError} role="alert">
          {error}
        </span>
      )}
    </dd>
  )
}
