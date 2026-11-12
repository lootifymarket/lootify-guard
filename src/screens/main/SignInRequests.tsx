import { useEffect, useEffectEvent, useState } from 'react'
import type { Account } from '../../api/accounts.ts'
import {
  answerSignIn,
  listSignInRequests,
  type SignInPlatform,
  type SignInRequest,
} from '../../api/signIns.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import Icon from '../../components/Icon.tsx'
import { fromAccounts, type AccountFailure } from './fromAccounts.ts'
import QrSignIn from './QrSignIn.tsx'
import styles from './SignInRequests.module.css'

type Item = SignInRequest & { accountName: string }

const PLATFORM_NAMES: Record<SignInPlatform, string> = {
  steamClient: 'Steam client',
  webBrowser: 'Browser',
  mobileApp: 'Steam mobile app',
  unknown: 'Unknown device',
}

const REFRESH =
  'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15'

type Props = {
  accounts: Account[]
  onChanged: () => void
}

/** People signing in to one of the accounts and waiting for its authenticator. */
export default function SignInRequests({ accounts, onChanged }: Props) {
  const signedIn = accounts
    .filter((account) => account.signedIn)
    .map((account) => account.accountName)
  const signedInKey = signedIn.join('\n')
  const [items, setItems] = useState<Item[] | null>(null)
  const [failures, setFailures] = useState<AccountFailure[]>([])
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [itemError, setItemError] = useState<{ id: string; text: string }>()
  const [denied, setDenied] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [status, setStatus] = useState('')
  const changed = useEffectEvent(onChanged)

  useEffect(() => {
    let active = true
    const names = signedInKey ? signedInKey.split('\n') : []
    void fromAccounts(names, listSignInRequests).then(({ items, failures }) => {
      if (!active) return
      setItems(items)
      setFailures(failures)
      if (failures.length > 0) changed()
    })
    return () => {
      active = false
    }
  }, [signedInKey, revision])

  async function answer(item: Item, allow: boolean) {
    setBusy(item.clientId)
    setItemError(undefined)
    setStatus('')
    try {
      await answerSignIn(item.accountName, item, allow)
    } catch (err) {
      setItemError({ id: item.clientId, text: errorMessage(err) })
      setBusy(null)
      onChanged()
      return
    }
    setBusy(null)
    setItems((all) => all?.filter((other) => other !== item) ?? null)
    if (allow) setStatus(`Sign-in allowed for ${item.accountName}.`)
    else setDenied(item.accountName)
  }

  const loading = items === null && signedIn.length > 0

  return (
    <section className={styles.panel} aria-labelledby="sign-ins-title">
      <div className={styles.head}>
        <h2 id="sign-ins-title" className={styles.title}>
          Sign-in requests
        </h2>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Refresh sign-in requests"
            title="Refresh"
            disabled={loading}
            onClick={() => {
              setItems(null)
              setRevision((r) => r + 1)
            }}
          >
            <Icon path={REFRESH} size={13} stroke={2} />
          </button>
          <button
            type="button"
            className={styles.qrButton}
            disabled={signedIn.length === 0}
            onClick={() => setQrOpen(true)}
          >
            QR sign-in
          </button>
        </div>
      </div>

      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {failures.map((failure) => (
        <p key={failure.accountName} className={styles.failure} role="alert">
          {failure.accountName}:{' '}
          <span className={styles.reason}>{failure.reason}</span>
        </p>
      ))}
      {loading && <p className={styles.note}>Loading…</p>}
      {items?.length === 0 && failures.length === 0 && (
        <p className={styles.note}>No new requests.</p>
      )}

      {items?.map((item) => (
        <div key={item.clientId} className={styles.card}>
          <div className={styles.words}>
            <span className={styles.who}>
              {item.accountName} ·{' '}
              {item.deviceName || PLATFORM_NAMES[item.platform]}
            </span>
            <span className={styles.where}>
              {[item.city, item.country].filter(Boolean).join(', ') ||
                'Unknown location'}
              {item.ip && ` · ${item.ip}`}
            </span>
            {item.unfamiliar && (
              <span className={styles.warning}>
                Steam hasn’t seen a sign-in from here before
              </span>
            )}
            {itemError?.id === item.clientId && (
              <span className={`${styles.failure} ${styles.reason}`}>
                {itemError.text}
              </span>
            )}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.deny}
              disabled={busy !== null}
              onClick={() => void answer(item, false)}
            >
              Not me
            </button>
            <Button
              size="sm"
              busy={busy === item.clientId}
              disabled={busy !== null}
              onClick={() => void answer(item, true)}
            >
              Allow
            </Button>
          </div>
        </div>
      ))}

      <QrSignIn
        open={qrOpen}
        accountNames={signedIn}
        onClose={() => setQrOpen(false)}
        onAllowed={(accountName) => {
          setQrOpen(false)
          setStatus(`Sign-in allowed for ${accountName}.`)
        }}
      />
      <Dialog
        open={denied !== null}
        title="Sign-in blocked"
        onClose={() => setDenied(null)}
      >
        <p className={dialogStyles.text}>
          Someone knows the password for {denied}. Change it in Steam now and
          sign out of all other sessions there.
        </p>
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={() => setDenied(null)}>
            Got it
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
