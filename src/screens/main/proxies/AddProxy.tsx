import { useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  addProxy,
  parseProxy,
  PROXY_KIND_NAMES,
  testProxy,
  type CheckResult,
  type ProxyKind,
} from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown from '../../../components/Dropdown.tsx'
import Flag from '../../../components/Flag.tsx'
import TextField from '../../../components/TextField.tsx'
import { useT } from '../../../i18n/index.ts'
import { countryName } from '../../../lib/countries.ts'
import styles from './Proxies.module.css'

type Props = {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

type Test =
  | { state: 'testing' }
  | ({ state: 'ok' } & CheckResult)
  | { state: 'failed'; reason: string }

const KIND_OPTIONS = Object.entries(PROXY_KIND_NAMES).map(([value, label]) => ({
  value,
  label,
}))

export default function AddProxy({ open, onClose, onAdded }: Props) {
  const t = useT().proxies.form
  const linkField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title={t.title}
      onClose={onClose}
      initialFocus={linkField}
    >
      <Form linkField={linkField} onCancel={onClose} onAdded={onAdded} />
    </Dialog>
  )
}

function Form({
  linkField,
  onCancel,
  onAdded,
}: {
  linkField: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onAdded: () => void
}) {
  const words = useT()
  const t = words.proxies.form
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const latestLink = useRef('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProxyKind>('socks5')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  // A result belongs to the fields it was run with, so editing them clears it.
  const [test, setTest] = useState<Test | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const portNumber = Number(port)
  // A link that didn't parse leaves the fields from an earlier one, which aren't
  // what the user means to add.
  const valid =
    linkError === '' &&
    host.trim() !== '' &&
    Number.isInteger(portNumber) &&
    portNumber > 0 &&
    portNumber < 65536
  const fields = {
    kind,
    host,
    port: portNumber,
    login: login || null,
    password: password || null,
  }

  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value)
      setTest(null)
    }
  }

  // Fills the fields below from a pasted link, so they can still be checked or edited.
  async function changeLink(value: string) {
    setLink(value)
    setLinkError('')
    setTest(null)
    latestLink.current = value
    if (!value.trim()) return
    try {
      const parsed = await parseProxy(value)
      if (latestLink.current !== value) return
      setKind(parsed.kind)
      setHost(parsed.host)
      setPort(String(parsed.port))
      setLogin(parsed.login ?? '')
      setPassword(parsed.password ?? '')
    } catch (err) {
      if (latestLink.current === value) setLinkError(errorMessage(err))
    }
  }

  async function runTest() {
    setTest({ state: 'testing' })
    try {
      setTest({ state: 'ok', ...(await testProxy(fields)) })
    } catch (err) {
      setTest({ state: 'failed', reason: errorMessage(err) })
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const country = test?.state === 'ok' ? test.country : null
      if (!(await addProxy(fields, name.trim() || null, country))) {
        setError(t.alreadyAdded)
        setBusy(false)
        return
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    onAdded()
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.linkField}>
        <TextField
          ref={linkField}
          label={t.link}
          placeholder="socks5://login:password@host:port"
          autoComplete="off"
          spellCheck={false}
          value={link}
          invalid={linkError !== ''}
          onChange={(event) => void changeLink(event.target.value)}
        />
        {linkError ? (
          <span className={styles.error}>{linkError}</span>
        ) : (
          <span className={styles.hint}>{t.linkHint}</span>
        )}
      </div>
      <TextField
        label={t.name}
        placeholder={t.namePlaceholder}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className={styles.addressFields}>
        <Dropdown
          label={t.type}
          value={kind}
          options={KIND_OPTIONS}
          onChange={(value) => edit(setKind)(value as ProxyKind)}
        />
        <TextField
          label={t.host}
          placeholder="185.12.40.7"
          autoComplete="off"
          spellCheck={false}
          value={host}
          onChange={(event) => edit(setHost)(event.target.value)}
        />
        <TextField
          label={t.port}
          placeholder="1080"
          inputMode="numeric"
          autoComplete="off"
          value={port}
          onChange={(event) =>
            edit(setPort)(event.target.value.replace(/\D/g, ''))
          }
        />
      </div>
      <div className={styles.credentialFields}>
        <TextField
          label={t.login}
          autoComplete="off"
          spellCheck={false}
          value={login}
          onChange={(event) => edit(setLogin)(event.target.value)}
        />
        <TextField
          label={t.password}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => edit(setPassword)(event.target.value)}
        />
      </div>
      <div className={styles.test}>
        <Button
          variant="secondary"
          size="sm"
          busy={test?.state === 'testing'}
          disabled={!valid || test?.state === 'testing'}
          onClick={() => void runTest()}
        >
          {t.test}
        </Button>
        <TestResult test={test} />
      </div>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {words.common.cancel}
        </Button>
        <Button type="submit" size="sm" busy={busy} disabled={!valid || busy}>
          {t.add}
        </Button>
      </div>
    </form>
  )
}

function TestResult({ test }: { test: Test | null }) {
  const t = useT().proxies.form
  if (test?.state === 'ok') {
    return (
      <span className={styles.testOk} role="status">
        {test.country && <Flag code={test.country} />}
        {t.connected(test.pingMs)}
        {test.country && ` · ${countryName(test.country)}`}
      </span>
    )
  }
  if (test?.state === 'failed') {
    return (
      <span className={styles.error} role="alert">
        {test.reason}
      </span>
    )
  }
  return null
}
