import { useEffect, useState } from 'react'
import {
  checkProxy,
  listProxies,
  PROXY_KIND_NAMES,
  proxyTitle,
  type CheckResult,
  type Proxy,
} from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Flag from '../../../components/Flag.tsx'
import Icon from '../../../components/Icon.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import layout from '../layout.module.css'
import AddProxy from './AddProxy.tsx'
import BulkImport from './BulkImport.tsx'
import ProxyDetails from './ProxyDetails.tsx'
import styles from './Proxies.module.css'

type Check =
  | { state: 'checking' }
  | ({ state: 'ok' } & CheckResult)
  | { state: 'failed'; reason: string }

const REFRESH =
  'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15'

// Each check holds a connection open for up to half a minute on a dead proxy.
const PARALLEL_CHECKS = 8

export default function Proxies() {
  const t = useT().proxies
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
    const queue = (proxies ?? []).map((proxy) => proxy.id)
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        await check(id)
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_CHECKS }, worker))
  }

  if (!proxies) {
    return error ? <p className={styles.error}>{error}</p> : null
  }

  const checking = Object.values(checks).some((c) => c.state === 'checking')
  const assigned = proxies.reduce((sum, p) => sum + p.accounts.length, 0)
  const open = proxies.find((proxy) => proxy.id === openId)

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          <span className={styles.summary}>
            {t.summary(proxies.length, assigned)}
          </span>
        </div>
        <div className={styles.tools}>
          <Button
            variant="secondary"
            size="sm"
            busy={checking}
            disabled={checking || proxies.length === 0}
            onClick={() => void checkAll()}
          >
            {checking ? t.checking : t.checkAll}
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            {t.add}
          </Button>
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.table} aria-label={t.list}>
          <div className={`${styles.row} ${styles.head}`}>
            <span>{t.columns.proxy}</span>
            <span>{t.columns.type}</span>
            <span>{t.columns.country}</span>
            <span>{t.columns.ping}</span>
            <span>{t.columns.accounts}</span>
            <span>{t.columns.status}</span>
          </div>
          {proxies.map((proxy) => {
            const last = checks[proxy.id]
            const country =
              (last?.state === 'ok' ? last.country : null) ?? proxy.country
            return (
              <div key={proxy.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.open}
                  onClick={() => setOpenId(proxy.id)}
                >
                  <span className={styles.title}>{proxyTitle(proxy)}</span>
                  {proxy.name && (
                    <span className={styles.address}>{proxy.address}</span>
                  )}
                </button>
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
                <span className={styles.mono}>{ping(t, last)}</span>
                <span className={styles.mono}>{proxy.accounts.length}</span>
                <span className={styles.statusCell}>
                  <Status check={last} />
                  <button
                    type="button"
                    className={styles.refresh}
                    aria-label={t.checkOne(proxyTitle(proxy))}
                    title={t.check}
                    disabled={last?.state === 'checking'}
                    onClick={() => void check(proxy.id)}
                  >
                    <Icon path={REFRESH} size={14} stroke={2} />
                  </button>
                </span>
              </div>
            )
          })}
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
        }}
      />
      {open && (
        <ProxyDetails
          proxy={open}
          onClose={() => setOpenId(null)}
          onRemoved={() => {
            setOpenId(null)
            reload()
          }}
        />
      )}
    </>
  )
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
