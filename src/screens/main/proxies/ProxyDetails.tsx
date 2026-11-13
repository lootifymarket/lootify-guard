import { useState } from 'react'
import {
  PROXY_KIND_NAMES,
  removeProxy,
  type Proxy,
} from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useT } from '../../../i18n/index.ts'
import styles from './Proxies.module.css'

type Props = {
  proxy: Proxy
  /** A check of it is under way. */
  checking: boolean
  onClose: () => void
  onCheck: () => void
  onRemoved: () => void
}

export default function ProxyDetails({
  proxy,
  checking,
  onClose,
  onCheck,
  onRemoved,
}: Props) {
  const t = useT().proxies.details
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const used = proxy.accounts.length

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await removeProxy(proxy.id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onRemoved()
  }

  return (
    <Dialog open title={proxy.name ?? proxy.address} onClose={onClose}>
      <span className={styles.detailsAddress}>
        {proxy.name && `${proxy.address} · `}
        {PROXY_KIND_NAMES[proxy.kind]}
        {proxy.hasLogin && t.withLogin}
      </span>
      {used > 0 ? (
        <ul className={styles.accounts}>
          {proxy.accounts.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p className={dialogStyles.text}>{t.noAccounts}</p>
      )}
      {used > 0 && <p className={dialogStyles.text}>{t.deleteWarning(used)}</p>}
      <button
        type="button"
        className={styles.delete}
        disabled={busy}
        onClick={() => void remove()}
      >
        {t.delete}
      </button>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t.close}
        </Button>
        <Button size="sm" busy={checking} disabled={checking} onClick={onCheck}>
          {t.check}
        </Button>
      </div>
    </Dialog>
  )
}
