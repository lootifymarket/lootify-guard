import { useState } from 'react'
import {
  revokeApiKey,
  trustApiKey,
  type ApiKey,
} from '../../../api/security.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import styles from './AccountPage.module.css'

type Props = {
  accountName: string
  apiKey: ApiKey
  /** The key was trusted or revoked, so it should be checked again. */
  onChanged: () => void
}

/** The warning about a Web API key on the account, with its two ways out. */
export default function ApiKeyAlert({ accountName, apiKey, onChanged }: Props) {
  const [revoking, setRevoking] = useState(false)
  const [trusting, setTrusting] = useState(false)
  const [error, setError] = useState('')

  async function trust() {
    setTrusting(true)
    setError('')
    try {
      await trustApiKey(accountName)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
    setTrusting(false)
  }

  return (
    <>
      <div className={styles.alert} role="alert">
        <div className={styles.alertWords}>
          <span className={styles.alertTitle}>
            A Web API key was found on this account
          </span>
          <span className={styles.alertText}>
            Domain {apiKey.domain}. If it wasn’t you, revoke it, or your trades
            can be hijacked.
          </span>
          {error && <span className={styles.error}>{error}</span>}
        </div>
        <div className={styles.alertActions}>
          <Button
            variant="secondary"
            size="sm"
            busy={trusting}
            disabled={trusting}
            onClick={() => void trust()}
          >
            It’s mine
          </Button>
          <Button size="sm" onClick={() => setRevoking(true)}>
            Revoke
          </Button>
        </div>
      </div>
      <Dialog
        open={revoking}
        title="Revoke the API key?"
        onClose={() => setRevoking(false)}
      >
        <Revoke
          accountName={accountName}
          domain={apiKey.domain}
          onCancel={() => setRevoking(false)}
          onRevoked={() => {
            setRevoking(false)
            onChanged()
          }}
        />
      </Dialog>
    </>
  )
}

function Revoke({
  accountName,
  domain,
  onCancel,
  onRevoked,
}: {
  accountName: string
  domain: string
  onCancel: () => void
  onRevoked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function revoke() {
    setBusy(true)
    setError('')
    try {
      await revokeApiKey(accountName)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onRevoked()
  }

  return (
    <>
      <p className={dialogStyles.text}>
        The {domain} key will be deleted and every deal through it stops
        working. If you didn’t make it, change the Steam password right away:
        whoever made it was in the account.
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
          onClick={() => void revoke()}
        >
          {busy ? 'Revoking…' : 'Revoke'}
        </Button>
      </div>
    </>
  )
}
