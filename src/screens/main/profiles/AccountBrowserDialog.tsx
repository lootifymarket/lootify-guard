import { useState } from 'react'
import type { Account } from '../../../api/accounts.ts'
import {
  clearSavedCookies,
  setBrowserRegion,
  type RegionChoice,
} from '../../../api/browser.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import RegionPicker from '../browser/RegionPicker.tsx'
import styles from './Profiles.module.css'

type Props = {
  account: Account
  proxy: Proxy | null
  onClose: () => void
  /** Something was saved; the account list should be read again. */
  onChanged: () => void
  /** Goes to the account's page, where its proxy is set. */
  onShowAccount: () => void
}

/** The browser settings of an account's own tab. Each change saves at once. */
export default function AccountBrowserDialog({
  account,
  proxy,
  onClose,
  onChanged,
  onShowAccount,
}: Props) {
  const words = useT()
  const t = words.profiles
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = account.accountName

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  return (
    <Dialog open title={name} onClose={onClose}>
      <div className={styles.form}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t.dialog.proxy}</span>
          <span className={styles.fixed}>
            <span className={styles.proxyName}>
              {proxy ? proxyTitle(proxy) : t.noProxy}
            </span>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                onClose()
                onShowAccount()
              }}
            >
              {t.accountPage}
            </button>
          </span>
          <span className={styles.hint}>{t.accountProxy}</span>
        </div>
        <div className={styles.field}>
          <RegionPicker
            value={account.browserRegion}
            proxyCountry={proxy?.country ?? null}
            onChange={(region: RegionChoice) =>
              void run(() => setBrowserRegion(name, region))
            }
          />
          <span className={styles.hint}>{words.browser.regionHint}</span>
        </div>
        <div className={styles.saved}>
          <span className={styles.savedText}>
            <span>{t.dialog.signIns}</span>
            <span className={styles.muted}>
              {account.savedSites > 0
                ? t.sites(account.savedSites)
                : t.nothingSaved}
            </span>
          </span>
          {account.savedSites > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await clearSavedCookies(name)
                  toast(t.cleared)
                })
              }
            >
              {t.dialog.clear}
            </Button>
          )}
        </div>
        <span className={styles.hint}>{t.steamStays}</span>
        {error && (
          <p className={dialogStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
