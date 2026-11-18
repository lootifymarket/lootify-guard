import { useRef, useState, type FormEvent } from 'react'
import {
  addBrowserProfile,
  profileTab,
  removeBrowserProfile,
  updateBrowserProfile,
  type BrowserProfile,
} from '../../../api/browserProfiles.ts'
import { clearSavedCookies, type RegionChoice } from '../../../api/browser.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import TextField from '../../../components/TextField.tsx'
import { useT } from '../../../i18n/index.ts'
import RegionPicker from '../browser/RegionPicker.tsx'
import styles from './Profiles.module.css'

type Props = {
  /** `null` for a new profile. */
  profile: BrowserProfile | null
  proxies: Proxy[]
  onClose: () => void
  onCreated: (id: number) => void
  onSaved: () => void
  onCleared: () => void
  onRemoved: (id: number) => void
}

const NO_PROXY = ''

export default function ProfileDialog({
  profile,
  proxies,
  onClose,
  onCreated,
  onSaved,
  onCleared,
  onRemoved,
}: Props) {
  const words = useT()
  const t = words.profiles
  const nameField = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile?.name ?? '')
  const [proxy, setProxy] = useState(
    profile?.proxyId?.toString() ??
      (profile ? NO_PROXY : (proxies[0]?.id.toString() ?? NO_PROXY)),
  )
  const [region, setRegion] = useState<RegionChoice>(
    profile?.region ?? { kind: 'matchProxy' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const proxyId = proxy === NO_PROXY ? null : Number(proxy)
  const proxyChanged = profile !== null && profile.proxyId !== proxyId

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      if (profile) {
        await updateBrowserProfile(profile.id, name, proxyId, region)
        onSaved()
      } else {
        onCreated(await addBrowserProfile(name, proxyId, region))
      }
    })
  }

  return (
    <Dialog
      open
      title={profile ? t.dialog.editTitle : t.dialog.newTitle}
      initialFocus={nameField}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={submit}>
        <TextField
          ref={nameField}
          label={t.dialog.name}
          placeholder={t.dialog.namePlaceholder}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className={styles.field}>
          <Dropdown
            label={t.dialog.proxy}
            value={proxy}
            options={[
              { value: NO_PROXY, label: t.noProxy },
              ...proxies.map((each) => ({
                value: each.id.toString(),
                label: proxyTitle(each),
              })),
            ]}
            onChange={setProxy}
          />
          {proxyChanged && (
            <span className={styles.warning}>
              {profile.savedSites > 0 && `${t.dialog.proxyMoved} `}
              {t.dialog.proxyNextTime}
            </span>
          )}
        </div>
        <div className={styles.field}>
          <RegionPicker
            value={region}
            proxyCountry={
              proxies.find((each) => each.id === proxyId)?.country ?? null
            }
            onChange={setRegion}
          />
          <span className={styles.hint}>{words.browser.regionHint}</span>
        </div>
        {profile && (
          <div className={styles.saved}>
            <span className={styles.savedText}>
              <span>{t.dialog.signIns}</span>
              <span className={styles.muted}>
                {profile.savedSites > 0
                  ? t.sites(profile.savedSites)
                  : t.nothingSaved}
              </span>
            </span>
            {profile.savedSites > 0 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await clearSavedCookies(profileTab(profile.id))
                    onCleared()
                  })
                }
              >
                {t.dialog.clear}
              </Button>
            )}
          </div>
        )}
        {profile && (
          <button
            type="button"
            className={styles.delete}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await removeBrowserProfile(profile.id)
                onRemoved(profile.id)
              })
            }
          >
            {t.dialog.delete}
          </button>
        )}
        {error && (
          <p className={dialogStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {words.common.cancel}
          </Button>
          <Button
            type="submit"
            size="sm"
            busy={busy}
            disabled={busy || name.trim() === ''}
          >
            {profile ? t.dialog.save : t.dialog.create}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
