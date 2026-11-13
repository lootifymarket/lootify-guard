import { useEffect, useEffectEvent, useState } from 'react'
import { changeAvatar, newTradeUrl, tradeUrl } from '../../../api/profile.ts'
import { errorMessage } from '../../../api/vault.ts'
import Avatar from '../../../components/Avatar.tsx'
import Button from '../../../components/Button.tsx'
import { useT } from '../../../i18n/index.ts'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useToast } from '../../../lib/toast.ts'
import ProfileForm from './ProfileForm.tsx'
import styles from './AccountPage.module.css'
import Private from '../../../components/Private.tsx'
import Skeleton from '../../../components/Skeleton.tsx'

type Props = {
  accountName: string
  steamId: string | null
  /** A data URL, or null before the profile was fetched. */
  avatar: string | null
  signedIn: boolean
  /** Steam turned the session down, so the account should be reloaded. */
  onChanged: () => void
}

export default function ProfileTab({
  accountName,
  steamId,
  avatar,
  signedIn,
  onChanged,
}: Props) {
  const words = useT()
  const t = words.account
  const toast = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const failed = useEffectEvent((err: unknown) => {
    setError(errorMessage(err))
    onChanged()
  })
  useEffect(() => {
    if (signedIn) void tradeUrl(accountName).then(setUrl, failed)
  }, [accountName, signedIn])

  if (!signedIn) {
    return <p className={styles.muted}>{t.profile.signInFirst}</p>
  }

  return (
    <>
      <AvatarPicker
        accountName={accountName}
        avatar={avatar}
        onChanged={onChanged}
      />
      <ProfileForm
        accountName={accountName}
        steamId={steamId}
        onChanged={onChanged}
      />
      <section className={styles.field} aria-labelledby="trade-url-title">
        <span id="trade-url-title" className={styles.fieldLabel}>
          {t.profile.tradeUrl}
        </span>
        <div className={styles.tradeUrl}>
          <span className={styles.tradeUrlText}>
            {url ? (
              <Private>{url}</Private>
            ) : (
              <Skeleton width="70%" height={12} />
            )}
          </span>
          <button
            type="button"
            className={styles.urlButton}
            disabled={!url}
            onClick={() =>
              url &&
              void navigator.clipboard.writeText(url).then(
                () => toast(t.profile.urlCopied),
                () => toast(words.common.copyFailed),
              )
            }
          >
            {t.copy}
          </button>
          <button
            type="button"
            className={styles.urlButton}
            disabled={!url}
            onClick={() => setConfirming(true)}
          >
            {t.profile.refresh}
          </button>
        </div>
        <span className={styles.muted}>{t.profile.tradeUrlHint}</span>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Dialog
          open={confirming}
          title={t.profile.newTradeUrl}
          onClose={() => setConfirming(false)}
        >
          <Refresh
            accountName={accountName}
            onCancel={() => setConfirming(false)}
            onMade={(next) => {
              setUrl(next)
              setConfirming(false)
              toast(t.profile.urlMade)
            }}
          />
        </Dialog>
      </section>
    </>
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
  const words = useT()
  const t = words.account.profile
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
      <p className={dialogStyles.text}>{t.newTradeUrlText}</p>
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
          onClick={() => void make()}
        >
          {t.refresh}
        </Button>
      </div>
    </>
  )
}

function AvatarPicker({
  accountName,
  avatar,
  onChanged,
}: {
  accountName: string
  avatar: string | null
  onChanged: () => void
}) {
  const t = useT().account.profile
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick() {
    setBusy(true)
    setError('')
    try {
      if (await changeAvatar(accountName)) {
        toast(t.avatarUpdated)
        onChanged()
      }
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <div className={styles.avatarPicker}>
      <Avatar name={accountName} src={avatar} size="lg" />
      <div className={styles.avatarWords}>
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => void pick()}
        >
          {busy ? t.uploading : t.changeAvatar}
        </Button>
        <span className={styles.muted}>{t.avatarHint}</span>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
