import { useEffect, useState } from 'react'
import {
  listBrowserProfiles,
  profileTint,
  type BrowserProfile,
} from '../../../api/browserProfiles.ts'
import { listProxies, proxyTitle, type Proxy } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Flag from '../../../components/Flag.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT } from '../../../i18n/index.ts'
import { ago } from '../../../lib/ago.ts'
import { useToast } from '../../../lib/toast.ts'
import layout from '../layout.module.css'
import ProfileDialog from './ProfileDialog.tsx'
import styles from './Profiles.module.css'

const SKELETON_ROWS = 3

type Props = {
  /** Opens the profile's tab. */
  onOpen: (id: number) => void
  /** The profile is gone, so its tab is. */
  onRemoved: (id: number) => void
}

/** Browser tabs signed in to no Steam account that keep their sign-ins. */
export default function Profiles({ onOpen, onRemoved }: Props) {
  const words = useT()
  const t = words.profiles
  const toast = useToast()
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  // `null` while closed; `'new'` for a new one.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const reload = () => setRevision((r) => r + 1)

  useEffect(() => {
    let active = true
    Promise.all([listBrowserProfiles(), listProxies()]).then(
      ([nextProfiles, nextProxies]) => {
        if (!active) return
        setProfiles(nextProfiles)
        setProxies(nextProxies)
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err))
      },
    )
    return () => {
      active = false
    }
  }, [revision])

  const signedIn = profiles?.filter((p) => p.savedSites > 0).length ?? 0
  const current =
    typeof editing === 'number'
      ? (profiles?.find((profile) => profile.id === editing) ?? null)
      : null

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          {profiles ? (
            <span className={styles.summary}>
              {profiles.length === 0
                ? t.intro
                : t.summary(profiles.length, signedIn)}
            </span>
          ) : (
            <Skeleton width={200} height={13} />
          )}
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          {t.newProfile}
        </Button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {profiles?.length === 0 ? (
        <div className={`${styles.empty} rise`}>
          <span className={styles.emptyTitle}>{t.emptyTitle}</span>
          <p className={styles.muted}>{t.emptyText}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing('new')}
          >
            {t.newProfile}
          </Button>
        </div>
      ) : (
        <section className={styles.table} aria-label={t.list}>
          <div className={`${styles.row} ${styles.head}`}>
            <span>{t.columns.profile}</span>
            <span>{t.columns.proxy}</span>
            <span>{t.columns.signIns}</span>
            <span>{t.columns.lastOpened}</span>
            <span />
          </div>
          {profiles === null
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className={styles.row}>
                  <Skeleton width={160} height={12} />
                  <Skeleton width={120} height={12} />
                  <Skeleton width={60} height={12} />
                  <Skeleton width={60} height={12} />
                  <span />
                </div>
              ))
            : profiles.map((profile) => (
                <div key={profile.id} className={`${styles.row} rise`}>
                  <span className={styles.name}>
                    <span
                      className={styles.mark}
                      style={{ background: profileTint(profile.id) }}
                      aria-hidden="true"
                    >
                      {profile.name.slice(0, 1).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className={styles.edit}
                      title={t.edit(profile.name)}
                      onClick={() => setEditing(profile.id)}
                    >
                      {profile.name}
                    </button>
                  </span>
                  <ProxyCell proxyId={profile.proxyId} proxies={proxies} />
                  <span
                    className={
                      profile.savedSites > 0 ? undefined : styles.muted
                    }
                  >
                    {profile.savedSites > 0
                      ? t.sites(profile.savedSites)
                      : t.nothingSaved}
                  </span>
                  <span className={styles.muted}>
                    {lastOpened(t, words.time.justNow, profile.lastOpened)}
                  </span>
                  <button
                    type="button"
                    className={styles.open}
                    aria-label={t.openName(profile.name)}
                    onClick={() => onOpen(profile.id)}
                  >
                    {t.open}
                  </button>
                </div>
              ))}
          {profiles && profiles.length > 0 && (
            <p className={styles.note}>{t.note}</p>
          )}
        </section>
      )}

      {editing !== null && (
        <ProfileDialog
          profile={current}
          proxies={proxies}
          onClose={() => setEditing(null)}
          onCreated={(id) => {
            setEditing(null)
            reload()
            onOpen(id)
          }}
          onSaved={() => {
            setEditing(null)
            reload()
            toast(t.saved)
          }}
          onCleared={() => {
            reload()
            toast(t.cleared)
          }}
          onRemoved={(id) => {
            setEditing(null)
            reload()
            onRemoved(id)
            toast(t.deleted)
          }}
        />
      )}
    </>
  )
}

function ProxyCell({
  proxyId,
  proxies,
}: {
  proxyId: number | null
  proxies: Proxy[]
}) {
  const t = useT().profiles
  if (proxyId === null) return <span className={styles.muted}>{t.noProxy}</span>
  const proxy = proxies.find((each) => each.id === proxyId)
  if (!proxy) return <span className={styles.danger}>{t.deletedProxy}</span>
  return (
    <span className={styles.proxy}>
      {proxy.country && <Flag code={proxy.country} />}
      <span className={styles.proxyName}>{proxyTitle(proxy)}</span>
    </span>
  )
}

function lastOpened(
  t: ReturnType<typeof useT>['profiles'],
  justNow: string,
  at: number | null,
) {
  if (at === null) return t.never
  const since = ago(at)
  return since === justNow ? since : t.ago(since)
}
