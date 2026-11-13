import { useState } from 'react'
import {
  revokeApiKey,
  trustApiKey,
  type ApiKey,
} from '../../../api/security.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
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
  const t = useT().account.apiKey
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
          <span className={styles.alertTitle}>{t.found}</span>
          <span className={styles.alertText}>{t.domain(apiKey.domain)}</span>
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
            {t.mine}
          </Button>
          <Button size="sm" onClick={() => setRevoking(true)}>
            {t.revoke}
          </Button>
        </div>
      </div>
      <Dialog
        open={revoking}
        title={t.revokeTitle}
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
  const words = useT()
  const t = words.account.apiKey
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
      <p className={dialogStyles.text}>{t.revokeText(domain)}</p>
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
          disabled={busy}
          onClick={() => void revoke()}
        >
          {busy ? t.revoking : t.revoke}
        </Button>
      </div>
    </>
  )
}
