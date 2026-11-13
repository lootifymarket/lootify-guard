import { useEffect, useEffectEvent, useState } from 'react'
import { newTradeUrl, tradeUrl } from '../../../api/profile.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useCopy } from '../../../lib/useCopy.ts'
import styles from './AccountPage.module.css'

type Props = {
  accountName: string
  signedIn: boolean
  /** Steam turned the session down, so the account should be reloaded. */
  onChanged: () => void
}

export default function ProfileTab({
  accountName,
  signedIn,
  onChanged,
}: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const { copy, label } = useCopy()

  const failed = useEffectEvent((err: unknown) => {
    setError(errorMessage(err))
    onChanged()
  })
  useEffect(() => {
    if (signedIn) void tradeUrl(accountName).then(setUrl, failed)
  }, [accountName, signedIn])

  if (!signedIn) {
    return (
      <p className={styles.muted}>
        Sign in to Steam on the Security tab to see the profile.
      </p>
    )
  }

  return (
    <section className={styles.section} aria-labelledby="trade-url-title">
      <h2 id="trade-url-title" className={styles.sectionTitle}>
        Trade URL
      </h2>
      <div className={styles.tradeUrl}>
        <span className={styles.tradeUrlText}>{url ?? 'Loading…'}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!url}
          onClick={() => url && copy('url', url)}
        >
          {label('url', 'Copy')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!url}
          onClick={() => setConfirming(true)}
        >
          Refresh
        </Button>
      </div>
      <span className={styles.muted}>
        Anyone with this link can send the account trade offers.
      </span>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={confirming}
        title="New trade URL"
        onClose={() => setConfirming(false)}
      >
        <Refresh
          accountName={accountName}
          onCancel={() => setConfirming(false)}
          onMade={(next) => {
            setUrl(next)
            setConfirming(false)
          }}
        />
      </Dialog>
    </section>
  )
}

function Refresh({
  accountName,
  onCancel,
  onMade,
}: {
  accountName: string
  onCancel: () => void
  onMade: (url: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function make() {
    setBusy(true)
    setError('')
    try {
      onMade(await newTradeUrl(accountName))
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <p className={dialogStyles.text}>
        The old link stops working and offers sent to it won’t arrive. Update it
        on Lootify and with your partners.
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
          onClick={() => void make()}
        >
          Refresh
        </Button>
      </div>
    </>
  )
}
