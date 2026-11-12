import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BIOMETRIC_NAMES,
  biometricStatus,
  createVault,
  enableBiometrics,
  errorMessage,
  type BiometricMethod,
} from '../api/vault.ts'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import Lockup from '../components/Lockup.tsx'
import LogoMark from '../components/LogoMark.tsx'
import TextField from '../components/TextField.tsx'
import Toggle from '../components/Toggle.tsx'
import { checkPassword } from '../lib/passwordStrength.ts'
import styles from './Onboarding.module.css'

const STEPS = ['Welcome', 'Master password']

const PROMISES = [
  {
    title: 'Stays on your computer',
    text: 'No cloud. Secrets are encrypted locally and never leave this device.',
    icon: 'M3 11h18v10H3zM7 11V7a5 5 0 0 1 10 0v4',
  },
  {
    title: 'Open source',
    text: 'Every line is public on GitHub, so anyone can check what it does.',
    icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  },
  {
    title: 'Built for traders and farms',
    text: 'Guard codes, confirmations, trades, proxies and bulk tasks.',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  },
]

const CHECK = 'M20 6L9 17l-5-5'
const DOT = 'M12 12h.01'

type Props = {
  onCreated: () => void
}

export default function Onboarding({ onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [biometric, setBiometric] = useState<BiometricMethod | null>(null)

  useEffect(() => {
    void biometricStatus().then((status) => setBiometric(status.method))
  }, [])

  return (
    <div className={styles.screen}>
      <aside className={styles.aside}>
        <Lockup size="sm" />
        <ol className={styles.steps}>
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={styles.step}
              data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className={styles.stepMark}>
                {i < step ? <Icon path={CHECK} size={12} stroke={3} /> : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className={styles.asideNote}>
          Everything stays on this computer, encrypted with your master
          password. Lootify never receives your passwords or Steam Guard
          secrets.
        </p>
      </aside>
      <main className={styles.main}>
        <div className={styles.content}>
          {step === 0 ? (
            <Welcome onNext={() => setStep(1)} />
          ) : (
            <MasterPassword
              biometric={biometric}
              onBack={() => setStep(0)}
              onCreated={onCreated}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className={`${styles.stepBody} ${styles.welcome}`}>
      <LogoMark size={72} />
      <div className={styles.heading}>
        <h1 className={styles.title}>Welcome to Lootify Guard</h1>
        <p className={styles.lead}>
          Steam Guard codes, trade confirmations and all your Steam accounts in
          one encrypted vault on this computer.
        </p>
      </div>
      <ul className={styles.promises}>
        {PROMISES.map((promise) => (
          <li key={promise.title} className={styles.promise}>
            <Icon path={promise.icon} size={18} stroke={1.8} />
            <span className={styles.promiseWords}>
              <span className={styles.promiseTitle}>{promise.title}</span>
              <span className={styles.promiseText}>{promise.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Button onClick={onNext}>Get started</Button>
      </div>
    </div>
  )
}

function MasterPassword({
  biometric,
  onBack,
  onCreated,
}: {
  biometric: BiometricMethod | null
  onBack: () => void
  onCreated: () => void
}) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [useBiometric, setUseBiometric] = useState(true)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  const weakDialog = useRef<HTMLDialogElement>(null)
  const strongerButton = useRef<HTMLButtonElement>(null)

  const { rules, score, strong } = checkPassword(password)
  const mismatch = repeat.length > 0 && repeat !== password
  const canCreate = password.length > 0 && repeat === password
  const checklist = [
    {
      met: rules.length,
      label: 'At least 12 characters',
      missing: 'Shorter than 12 characters',
    },
    {
      met: rules.numberOrSymbol,
      label: 'A number or a symbol',
      missing: 'No numbers or symbols',
    },
    {
      met: rules.mixedCase,
      label: 'Upper and lower case letters',
      missing: 'Not mixing upper and lower case',
    },
  ]

  async function create() {
    weakDialog.current?.close()
    setBusy(true)
    setError('')
    try {
      await createVault(password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
      return
    }
    setCreated(true)
    if (biometric && useBiometric) {
      try {
        await enableBiometrics()
      } catch (err) {
        // The vault itself is fine, so let the user go on without biometrics.
        setError(
          `The vault is ready, but ${BIOMETRIC_NAMES[biometric]} couldn’t be turned on: ${errorMessage(err)}`,
        )
        setBusy(false)
        return
      }
    }
    onCreated()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (created) {
      onCreated()
      return
    }
    if (!canCreate || busy) return
    if (strong) {
      void create()
      return
    }
    weakDialog.current?.showModal()
    // Otherwise the dialog focuses "Use it anyway", and Enter would accept the weak password.
    strongerButton.current?.focus()
  }

  return (
    <form className={styles.stepBody} onSubmit={submit}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Create a master password</h1>
        <p className={styles.lead}>
          It encrypts your vault, and you’ll enter it every time you open the
          app. Nobody can read your vault without it, not even us.
        </p>
      </div>
      <div className={styles.group}>
        <TextField
          type="password"
          label="Master password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className={styles.meter} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={styles.bar}
              data-filled={i < score}
              data-weak={score < 3}
            />
          ))}
        </div>
        <span
          className={styles.hint}
          data-tone={!password ? 'faint' : score < 3 ? 'danger' : 'secondary'}
        >
          {!password
            ? 'Use a long passphrase. Four or more random words work well.'
            : score < 3
              ? 'Weak password'
              : score < 4
                ? 'Good password'
                : 'Strong password'}
        </span>
      </div>
      <div className={styles.group}>
        <TextField
          type="password"
          label="Repeat password"
          autoComplete="new-password"
          value={repeat}
          invalid={mismatch}
          onChange={(event) => setRepeat(event.target.value)}
        />
        {mismatch && (
          <span className={styles.hint} data-tone="danger">
            Passwords don’t match
          </span>
        )}
      </div>
      <ul className={styles.rules}>
        <li className={styles.rulesTitle}>Recommended</li>
        {checklist.map((rule) => (
          <li key={rule.label} className={styles.rule} data-met={rule.met}>
            <Icon path={rule.met ? CHECK : DOT} size={14} stroke={2.4} />
            {rule.label}
          </li>
        ))}
      </ul>
      {biometric && (
        <div className={styles.option}>
          <span className={styles.optionWords}>
            <span>Unlock with {BIOMETRIC_NAMES[biometric]}</span>
            <span className={styles.optionText}>
              Also lets you set a new password on this computer if you forget
              it.
            </span>
          </span>
          <Toggle
            on={useBiometric}
            label={`Unlock with ${BIOMETRIC_NAMES[biometric]}`}
            onChange={setUseBiometric}
          />
        </div>
      )}
      {error && (
        <span className={styles.hint} data-tone="danger" role="alert">
          {error}
        </span>
      )}
      <div className={styles.actions}>
        {!created && (
          <Button variant="secondary" className={styles.back} onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={!canCreate && !created}>
          {created ? 'Continue' : busy ? 'Creating vault…' : 'Create vault'}
        </Button>
      </div>

      <dialog
        ref={weakDialog}
        className={styles.dialog}
        aria-labelledby="weak-title"
      >
        <div className={styles.heading}>
          <h2 id="weak-title" className={styles.dialogTitle}>
            This password is easy to guess
          </h2>
          <p className={styles.dialogText}>
            If malware copies your vault file, a weak password can be cracked
            offline in hours, exposing every Steam Guard secret inside. A long
            passphrase takes years.
          </p>
        </div>
        <ul className={styles.missing}>
          {checklist
            .filter((rule) => !rule.met)
            .map((rule) => (
              <li key={rule.missing}>{rule.missing}</li>
            ))}
        </ul>
        <div className={styles.dialogActions}>
          <Button variant="secondary" size="sm" onClick={() => void create()}>
            Use it anyway
          </Button>
          <Button
            ref={strongerButton}
            size="sm"
            onClick={() => weakDialog.current?.close()}
          >
            Make it stronger
          </Button>
        </div>
      </dialog>
    </form>
  )
}
