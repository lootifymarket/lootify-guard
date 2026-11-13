import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import {
  addAccountCancel,
  addAccountConfirm,
  addAccountGuard,
  addAccountSignIn,
  addAccountSignInCode,
  saveNewRevocationCode,
  type ConfirmBy,
  type GuardMethod,
  type NewAccount,
  type SignInCode,
} from '../../../api/addAccount.ts'
import {
  listProxies,
  PROXY_KIND_NAMES,
  proxyTitle,
  type Proxy,
} from '../../../api/proxies.ts'
import { errorMessage, isWrongPassword } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import Dropdown, { type DropdownOption } from '../../../components/Dropdown.tsx'
import Flag from '../../../components/Flag.tsx'
import TextField from '../../../components/TextField.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { useCopy } from '../../../lib/useCopy.ts'
import layout from '../layout.module.css'
import styles from './AddAccount.module.css'

const STEPS = ['Sign in', 'Steam Guard', 'Revocation code']

type Stage =
  | { step: 0 }
  | { step: 1; accountName: string; onPhone: boolean }
  | { step: 2; added: NewAccount }

/** What the code dialog asks for: a code to sign in, or one to confirm Guard with. */
type Asking =
  | { for: 'signIn'; from: SignInCode; accountName: string }
  | { for: 'guard'; method: GuardMethod; by: ConfirmBy }

type Props = {
  onCancel: () => void
  /** The account is in the vault, its Guard already working. */
  onAdded: () => void
  onDone: (accountName: string) => void
}

/** Signs in to an account that isn't in the vault and sets up Steam Guard for it here. */
export default function AddAccount({ onCancel, onAdded, onDone }: Props) {
  const [stage, setStage] = useState<Stage>({ step: 0 })
  const [asking, setAsking] = useState<Asking | null>(null)

  // Leaving the screen drops whatever Steam sign-in the backend still holds.
  useEffect(() => () => void addAccountCancel(), [])

  function restart() {
    void addAccountCancel()
    setAsking(null)
    setStage({ step: 0 })
  }

  return (
    <div className={styles.page}>
      <div className={styles.progress}>
        <span className={styles.stepName}>
          {stage.step + 1} / {STEPS.length} · {STEPS[stage.step]}
        </span>
        <div className={styles.bars} aria-hidden="true">
          {STEPS.map((name, i) => (
            <span
              key={name}
              className={i <= stage.step ? layout.barFill : layout.bar}
            />
          ))}
        </div>
      </div>

      {stage.step === 0 && (
        <SignIn
          onCancel={onCancel}
          onCode={(accountName, from) =>
            setAsking({ for: 'signIn', from, accountName })
          }
          onSignedIn={(accountName, onPhone) =>
            setStage({ step: 1, accountName, onPhone })
          }
        />
      )}
      {stage.step === 1 && (
        <Guard
          accountName={stage.accountName}
          onPhone={stage.onPhone}
          onBack={restart}
          onSent={(method, by) => setAsking({ for: 'guard', method, by })}
        />
      )}
      {stage.step === 2 && (
        <Revocation
          added={stage.added}
          onDone={() => onDone(stage.added.accountName)}
        />
      )}

      <CodeDialog
        asking={asking}
        onCancel={() => {
          // The sign-in can't go on without its code, but a Guard request can be sent again.
          if (asking?.for === 'signIn') restart()
          else setAsking(null)
        }}
        onSignedIn={(accountName, onPhone) => {
          setAsking(null)
          setStage({ step: 1, accountName, onPhone })
        }}
        onAdded={(added) => {
          setAsking(null)
          setStage({ step: 2, added })
          onAdded()
        }}
      />
    </div>
  )
}

function SignIn({
  onCancel,
  onCode,
  onSignedIn,
}: {
  onCancel: () => void
  onCode: (accountName: string, from: SignInCode) => void
  onSignedIn: (accountName: string, onPhone: boolean) => void
}) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [proxyId, setProxyId] = useState('')
  const [remember, setRemember] = useState(false)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)

  useEffect(() => {
    void listProxies().then(setProxies)
  }, [])

  const proxyOptions: DropdownOption[] = [
    { value: '', label: 'No proxy' },
    ...proxies.map((proxy) => ({
      value: String(proxy.id),
      label: proxyTitle(proxy),
      hint: proxy.name
        ? `${proxy.address} · ${PROXY_KIND_NAMES[proxy.kind]}`
        : PROXY_KIND_NAMES[proxy.kind],
      icon: proxy.country ? <Flag code={proxy.country} /> : undefined,
    })),
  ]
  const accountName = login.trim()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!accountName || !password || busy) return
    setBusy(true)
    setError('')
    setWrongPassword(false)
    try {
      const next = await addAccountSignIn(
        accountName,
        password,
        proxyId === '' ? null : Number(proxyId),
        remember,
      )
      if (next.step === 'code') onCode(accountName, next.from)
      else onSignedIn(accountName, next.onPhone)
    } catch (err) {
      setWrongPassword(isWrongPassword(err))
      setError(
        isWrongPassword(err)
          ? 'Steam says the login or password is wrong'
          : errorMessage(err),
      )
    }
    setBusy(false)
  }

  return (
    <form className={styles.body} onSubmit={(event) => void submit(event)}>
      <h1 className={layout.title}>Sign in to Steam</h1>
      <TextField
        label="Login"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={login}
        onChange={(event) => setLogin(event.target.value)}
      />
      <TextField
        type="password"
        label="Password"
        autoComplete="off"
        value={password}
        invalid={wrongPassword}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Dropdown
        label="Proxy"
        value={proxyId}
        options={proxyOptions}
        onChange={setProxyId}
      />
      <div className={styles.option}>
        <span>Save the password, not just the session</span>
        <Toggle on={remember} label="Save password" onChange={setRemember} />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          busy={busy}
          disabled={!accountName || !password || busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}

const METHODS: {
  method: GuardMethod
  name: string
  text: string
  unavailable: string
}[] = [
  {
    method: 'new',
    name: 'Add a new authenticator',
    text: 'Made here and confirmed with a code Steam sends by SMS or email.',
    unavailable:
      'Steam Guard is already on a phone. Move it instead, or import its .maFile from the accounts list.',
  },
  {
    method: 'move',
    name: 'Move from phone',
    text: 'Officially through Steam, confirmed by SMS. Guard stops working on the phone.',
    unavailable: 'This account has no Steam Guard on a phone to move.',
  },
]

function Guard({
  accountName,
  onPhone,
  onBack,
  onSent,
}: {
  accountName: string
  onPhone: boolean
  onBack: () => void
  onSent: (method: GuardMethod, by: ConfirmBy) => void
}) {
  const method: GuardMethod = onPhone ? 'move' : 'new'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try {
      onSent(method, await addAccountGuard(method))
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <div className={styles.body}>
      <h1 className={layout.title}>Steam Guard</h1>
      <p className={styles.lead}>
        {onPhone
          ? `${accountName} has Steam Guard on a phone.`
          : `${accountName} has no mobile authenticator.`}
      </p>
      <div className={styles.methods} role="radiogroup" aria-label="Method">
        {METHODS.map((item) => {
          const available = item.method === method
          return (
            <div
              key={item.method}
              role="radio"
              aria-checked={available}
              aria-disabled={!available}
              className={styles.method}
            >
              <span className={styles.ring} aria-hidden="true" />
              <span className={styles.methodWords}>
                <span className={styles.methodName}>{item.name}</span>
                <span className={styles.methodText}>
                  {available ? item.text : item.unavailable}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <p className={styles.note}>
        For the first 7 days after adding Guard, trades are held. That’s how
        Steam works.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button busy={busy} disabled={busy} onClick={() => void send()}>
          {busy ? 'Asking Steam…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

function Revocation({
  added,
  onDone,
}: {
  added: NewAccount
  onDone: () => void
}) {
  const [stored, setStored] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { copy, label } = useCopy()
  const code = added.revocationCode

  async function save() {
    setError('')
    try {
      const name = await saveNewRevocationCode()
      if (name) setSaved(name)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className={styles.body}>
      <h1 className={layout.title}>Revocation code</h1>
      {code ? (
        <>
          <p className={styles.lead}>
            The only way to remove Steam Guard from {added.accountName} if this
            vault is lost. Keep a copy outside this computer.
          </p>
          <span className={styles.code}>{code}</span>
          <div className={styles.codeActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copy('code', code)}
            >
              {label('code', 'Copy')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void save()}>
              Save .txt
            </Button>
          </div>
          {saved && <p className={styles.note}>Saved as {saved}</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={stored}
              onChange={(event) => setStored(event.target.checked)}
            />
            I stored the code somewhere safe
          </label>
        </>
      ) : (
        <p className={styles.lead}>
          {added.accountName} is added, but Steam gave no revocation code.
        </p>
      )}
      <div className={styles.actions}>
        <Button disabled={code !== null && !stored} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

function CodeDialog({
  asking,
  onCancel,
  onSignedIn,
  onAdded,
}: {
  asking: Asking | null
  onCancel: () => void
  onSignedIn: (accountName: string, onPhone: boolean) => void
  onAdded: (added: NewAccount) => void
}) {
  const field = useRef<HTMLInputElement>(null)
  const title =
    asking?.for === 'signIn'
      ? asking.from === 'phone'
        ? 'Steam Guard code'
        : 'Email code'
      : asking?.method === 'move'
        ? 'Move from phone'
        : 'Confirmation code'
  return (
    <Dialog
      open={asking !== null}
      title={title}
      onClose={onCancel}
      initialFocus={field}
    >
      {asking && (
        <CodeForm
          asking={asking}
          field={field}
          onCancel={onCancel}
          onSignedIn={onSignedIn}
          onAdded={onAdded}
        />
      )}
    </Dialog>
  )
}

function CodeForm({
  asking,
  field,
  onCancel,
  onSignedIn,
  onAdded,
}: {
  asking: Asking
  field: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onSignedIn: (accountName: string, onPhone: boolean) => void
  onAdded: (added: NewAccount) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!code || busy) return
    setBusy(true)
    setError('')
    try {
      if (asking.for === 'signIn') {
        const next = await addAccountSignInCode(code)
        if (next.step === 'guard') onSignedIn(asking.accountName, next.onPhone)
      } else {
        onAdded(await addAccountConfirm(code))
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={dialogStyles.text}>{codeText(asking)}</p>
      <TextField
        ref={field}
        label="Code"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        className={styles.codeInput}
        value={code}
        invalid={error !== ''}
        onChange={(event) =>
          setCode(event.target.value.replace(/\s/g, '').toUpperCase())
        }
      />
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={dialogStyles.actions}>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" busy={busy} disabled={!code || busy}>
          {busy ? 'Checking…' : 'Confirm'}
        </Button>
      </div>
    </form>
  )
}

function codeText(asking: Asking) {
  if (asking.for === 'signIn') {
    return asking.from === 'phone'
      ? 'Enter the code Steam Guard shows in the Steam app on the account’s phone.'
      : 'Steam sent a code to the account’s email.'
  }
  if (asking.by.by === 'email') {
    return 'Steam sent a code to the account’s email. Enter it to turn on the new authenticator.'
  }
  const phone = asking.by.phoneHint
    ? `the phone ending in ${asking.by.phoneHint}`
    : 'the account’s phone number'
  return asking.method === 'move'
    ? `Steam sent an SMS to ${phone}. Once you enter it, Guard stops working on the phone.`
    : `Steam sent an SMS to ${phone}. Enter it to turn on the new authenticator.`
}
