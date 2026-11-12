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
          <h1 className={layout.title}>Proxies</h1>
          <span className={styles.summary}>
            {proxies.length} {proxies.length === 1 ? 'proxy' : 'proxies'} ·{' '}
            {assigned} {assigned === 1 ? 'account' : 'accounts'} on them
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
            {checking ? 'Checking…' : 'Check all'}
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            Add
          </Button>
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.table} aria-label="Proxy list">
          <div className={`${styles.row} ${styles.head}`}>
            <span>Proxy</span>
            <span>Type</span>
            <span>Country</span>
            <span>Ping</span>
            <span>Accounts</span>
            <span>Status</span>
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
                <span className={styles.mono}>{ping(last)}</span>
                <span className={styles.mono}>{proxy.accounts.length}</span>
                <span className={styles.statusCell}>
                  <Status check={last} />
                  <button
                    type="button"
                    className={styles.refresh}
                    aria-label={`Check ${proxyTitle(proxy)}`}
                    title="Check"
                    disabled={last?.state === 'checking'}
                    onClick={() => void check(proxy.id)}
                  >
                    <Icon path={REFRESH} size={14} stroke={2} />
                  </button>
                </span>
              </div>
            )
          })}
          {proxies.length === 0 && (
            <p className={layout.note}>
              No proxies yet. Add one, or paste a list on the right.
            </p>
          )}
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

function ping(check: Check | undefined) {
  return check?.state === 'ok' ? `${check.pingMs} ms` : '—'
}

function Status({ check }: { check: Check | undefined }) {
  const [tone, text] =
    check === undefined
      ? ['idle', 'Not checked']
      : check.state === 'checking'
        ? ['idle', 'Checking…']
        : check.state === 'ok'
          ? ['ok', 'Working']
          : ['failed', 'Not responding']
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
