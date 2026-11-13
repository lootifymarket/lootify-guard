import { useEffect, useState } from 'react'
import {
  checkProxy,
  listProxies,
  PROXY_KIND_NAMES,
  type CheckResult,
  type Proxy,
} from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Flag from '../../../components/Flag.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import layout from '../layout.module.css'
import AddProxy from './AddProxy.tsx'
import BulkImport from './BulkImport.tsx'
import ProxyDetails from './ProxyDetails.tsx'
import styles from './Proxies.module.css'

type Check =
  | { state: 'checking' }
  | ({ state: 'ok' } & CheckResult)
  | { state: 'failed'; reason: string }

// Each check holds a connection open for up to half a minute on a dead proxy.
const PARALLEL_CHECKS = 8
const SKELETON_ROWS = 4

export default function Proxies() {
  const t = useT().proxies
  const toast = useToast()
  const [proxies, setProxies] = useState<Proxy[] | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [checks, setChecks] = useState<Record<number, Check>>({})
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const reload = () => setRevision((r) => r + 1)

  useEffect(() => {
    let active = true
    listProxies().then(
      (next) => {
        if (active) setProxies(next)
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err))
      },
    )
    return () => {
      active = false
    }
  }, [revision])

  async function check(id: number) {
    setChecks((all) => ({ ...all, [id]: { state: 'checking' } }))
    let result: Check
    try {
      result = { state: 'ok', ...(await checkProxy(id)) }
    } catch (err) {
      result = { state: 'failed', reason: errorMessage(err) }
    }
    setChecks((all) => ({ ...all, [id]: result }))
  }

  async function checkAll() {
    const ids = (proxies ?? []).map((proxy) => proxy.id)
    const queue = [...ids]
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        await check(id)
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_CHECKS }, worker))
    toast(t.checked(ids.length))
  }

  const header = (tools: boolean) => (
    <div className={layout.header}>
      <div className={styles.heading}>
        <h1 className={layout.title}>{t.title}</h1>
        {proxies ? (
          <span className={styles.summary}>{summary(t, proxies, checks)}</span>
        ) : (
          <Skeleton width={180} height={13} />
        )}
      </div>
      {tools && (
        <div className={styles.tools}>
          <Button
            variant="secondary"
            size="sm"
            busy={checking}
            disabled={checking || !proxies || proxies.length === 0}
            onClick={() => void checkAll()}
          >
            {checking ? t.checking : t.checkAll}
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            {t.add}
          </Button>
        </div>
      )}
    </div>
  )

  const checking = Object.values(checks).some((c) => c.state === 'checking')

  if (!proxies) {
    return (
      <>
        {header(false)}
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : (
          <div className={styles.body}>
            <section className={styles.table}>
              <Head />
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className={styles.row}>
                  <Skeleton width={180} height={12} />
                  <Skeleton width={56} height={12} />
                  <Skeleton width={64} height={12} />
                  <Skeleton width={44} height={12} />
                  <Skeleton width={24} height={12} />
                  <Skeleton width={90} height={12} />
                </div>
              ))}
            </section>
            <BulkImport onImported={reload} />
          </div>
        )}
      </>
    )
  }

  const open = proxies.find((proxy) => proxy.id === openId)

  return (
    <>
      {header(true)}

      <div className={styles.body}>
        <section className={styles.table} aria-label={t.list}>
          <Head />
          <div className="rise">
            {proxies.map((proxy) => {
              const last = checks[proxy.id]
              const country =
                (last?.state === 'ok' ? last.country : null) ?? proxy.country
              return (
                <button
                  key={proxy.id}
                  type="button"
                  className={`${styles.row} ${styles.open}`}
                  onClick={() => setOpenId(proxy.id)}
                >
                  <span className={styles.names}>
                    {proxy.name ? (
                      <>
                        <span className={styles.title}>{proxy.name}</span>
                        <span className={styles.address}>{proxy.address}</span>
                      </>
                    ) : (
                      <span className={styles.address}>{proxy.address}</span>
                    )}
                  </span>
                  <span className={styles.muted}>
                    {PROXY_KIND_NAMES[proxy.kind]}
                  </span>
                  <span className={styles.country}>
                    {country ? (
                      <>
                        <Flag code={country} />
                        {country}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                  {last?.state === 'checking' ? (
                    <Skeleton width={44} height={12} />
                  ) : (
                    <span className={styles.mono}>{ping(t, last)}</span>
                  )}
                  <span className={styles.mono}>{proxy.accounts.length}</span>
                  <Status check={last} />
                </button>
              )
            })}
          </div>
          {proxies.length === 0 && <p className={layout.note}>{t.empty}</p>}
        </section>
        <BulkImport onImported={reload} />
      </div>

      <AddProxy
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false)
          reload()
          toast(t.added)
        }}
      />
      {open && (
        <ProxyDetails
          proxy={open}
          checking={checks[open.id]?.state === 'checking'}
          onClose={() => setOpenId(null)}
          onCheck={() => {
            setOpenId(null)
            void check(open.id).then(() => toast(t.checkComplete))
          }}
          onRemoved={() => {
            setOpenId(null)
            reload()
            toast(t.deleted)
          }}
        />
      )}
    </>
  )
}

function Head() {
  const t = useT().proxies
  return (
    <div className={`${styles.row} ${styles.head}`}>
      <span>{t.columns.proxy}</span>
      <span>{t.columns.type}</span>
      <span>{t.columns.country}</span>
      <span>{t.columns.ping}</span>
      <span>{t.columns.accounts}</span>
      <span>{t.columns.status}</span>
    </div>
  )
}

/** How many there are, and how the last checks went. */
function summary(
  t: Dictionary['proxies'],
  proxies: Proxy[],
  checks: Record<number, Check>,
) {
  const assigned = proxies.reduce((sum, p) => sum + p.accounts.length, 0)
  const results = Object.values(checks)
  const failed = results.filter((check) => check.state === 'failed').length
  const base = t.summary(proxies.length, assigned)
  if (failed > 0) return `${base} · ${t.notRespondingCount(failed)}`
  const allChecked =
    proxies.length > 0 &&
    proxies.every((proxy) => checks[proxy.id]?.state === 'ok')
  return allChecked ? `${base} · ${t.allWorking}` : base
}

function ping(t: Dictionary['proxies'], check: Check | undefined) {
  return check?.state === 'ok' ? t.ms(check.pingMs) : '—'
}

function Status({ check }: { check: Check | undefined }) {
  const t = useT().proxies
  const [tone, text] =
    check === undefined
      ? ['idle', t.notChecked]
      : check.state === 'checking'
        ? ['idle', t.checking]
        : check.state === 'ok'
          ? ['ok', t.working]
          : ['failed', t.notResponding]
  return (
    <span
      className={styles.status}
      data-tone={tone}
      title={check?.state === 'failed' ? check.reason : undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </span>
  )
}
