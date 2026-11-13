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
import { LANGUAGES, useLanguage, useT, type Language } from '../i18n/index.ts'
import {
  AUTO_LOCK_CHOICES,
  saveLanguage,
  setAutoLock,
  setLaunchAtStartup,
} from '../api/settings.ts'
import Dropdown from '../components/Dropdown.tsx'
import { checkPassword } from '../lib/passwordStrength.ts'
import styles from './Onboarding.module.css'

// In the order of the promises in the dictionary.
const PROMISE_ICONS = [
  'M3 11h18v10H3zM7 11V7a5 5 0 0 1 10 0v4',
  'M16 18l6-6-6-6M8 6l-6 6 6 6',
  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
]

const CHECK = 'M20 6L9 17l-5-5'
const DOT = 'M12 12h.01'
const NEVER = 'never'

type Props = {
  onCreated: () => void
}

export default function Onboarding({ onCreated }: Props) {
  const t = useT().onboarding
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
          {t.steps.map((label, i) => (
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
        <p className={styles.asideNote}>{t.asideNote}</p>
      </aside>
      <main className={styles.main}>
        <div className={styles.content}>
          {step === 0 && <Welcome onNext={() => setStep(1)} />}
          {step === 1 && (
            <MasterPassword
              biometric={biometric}
              onBack={() => setStep(0)}
              onCreated={() => setStep(2)}
            />
          )}
          {step === 2 && <Preferences onDone={onCreated} />}
        </div>
      </main>
    </div>
  )
}

/** The language can be picked before there's a vault, from the first screen. */
function LanguagePicker() {
  const { language, t, setLanguage } = useLanguage()
  return (
    <div className={styles.option}>
      <span className={styles.optionLabel}>{t.settings.language}</span>
      <span className={styles.language}>
        <Dropdown
          label={t.settings.language}
          hideLabel
          size="sm"
          value={language}
          options={LANGUAGES}
          onChange={(value) => {
            setLanguage(value as Language)
            void saveLanguage(value as Language)
          }}
        />
      </span>
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  const t = useT().onboarding
  return (
    <div className={`${styles.stepBody} ${styles.welcome}`}>
      <LogoMark size={72} />
      <div className={styles.heading}>
        <h1 className={styles.title}>{t.welcomeTitle}</h1>
        <p className={styles.lead}>{t.welcomeLead}</p>
      </div>
      <ul className={styles.promises}>
        {t.promises.map((promise, i) => (
          <li key={promise.title} className={styles.promise}>
            <Icon path={PROMISE_ICONS[i]} size={18} stroke={1.8} />
            <span className={styles.promiseWords}>
              <span className={styles.promiseTitle}>{promise.title}</span>
              <span className={styles.promiseText}>{promise.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <LanguagePicker />
      <div className={styles.actions}>
        <Button onClick={onNext}>{t.getStarted}</Button>
      </div>
    </div>
  )
}

/** The settings most worth picking up front, now that there's a vault to lock. */
function Preferences({ onDone }: { onDone: () => void }) {
  const words = useT()
  const t = words.onboarding
  const settings = words.settings
  const [autoLock, setAutoLockChoice] = useState('15')
  const [atStartup, setAtStartup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function finish() {
    setBusy(true)
    setError('')
    try {
      await setAutoLock(autoLock === NEVER ? null : Number(autoLock))
      if (atStartup) await setLaunchAtStartup(true)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className={styles.stepBody}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{t.prefsTitle}</h1>
        <p className={styles.lead}>{t.prefsLead}</p>
      </div>
      <div className={styles.rows}>
        <div className={styles.row}>
          <span>{settings.autoLock}</span>
          <span className={styles.rowControl}>
            <Dropdown
              label={settings.autoLock}
              hideLabel
              size="sm"
              value={autoLock}
              options={[
                ...AUTO_LOCK_CHOICES.map((minutes) => ({
                  value: String(minutes),
                  label: settings.minutes(minutes),
                })),
                { value: NEVER, label: settings.never },
              ]}
              onChange={setAutoLockChoice}
            />
          </span>
        </div>
        <div className={styles.row}>
          <span>{settings.startup}</span>
          <Toggle
            on={atStartup}
            label={settings.startup}
            onChange={setAtStartup}
          />
        </div>
      </div>
      {error && (
        <span className={styles.hint} data-tone="danger" role="alert">
          {error}
        </span>
      )}
      <div className={styles.actions}>
        <Button busy={busy} disabled={busy} onClick={() => void finish()}>
          {words.common.continue}
        </Button>
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
  const words = useT()
  const t = words.onboarding
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
      label: t.rules.length,
      missing: t.rules.lengthMissing,
    },
    {
      met: rules.numberOrSymbol,
      label: t.rules.numberOrSymbol,
      missing: t.rules.numberOrSymbolMissing,
    },
    {
      met: rules.mixedCase,
      label: t.rules.mixedCase,
      missing: t.rules.mixedCaseMissing,
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
          t.biometricFailed(BIOMETRIC_NAMES[biometric], errorMessage(err)),
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
        <h1 className={styles.title}>{t.createTitle}</h1>
        <p className={styles.lead}>{t.createLead}</p>
      </div>
      <div className={styles.group}>
        <TextField
          type="password"
          label={t.masterPassword}
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
            ? t.passphraseHint
            : score < 3
              ? t.weak
              : score < 4
                ? t.good
                : t.strong}
        </span>
      </div>
      <div className={styles.group}>
        <TextField
          type="password"
          label={t.repeatPassword}
          autoComplete="new-password"
          value={repeat}
          invalid={mismatch}
          onChange={(event) => setRepeat(event.target.value)}
        />
        {mismatch && (
          <span className={styles.hint} data-tone="danger">
            {t.mismatch}
          </span>
        )}
      </div>
      <ul className={styles.rules}>
        <li className={styles.rulesTitle}>{t.recommended}</li>
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
            <span>{t.unlockWith(BIOMETRIC_NAMES[biometric])}</span>
            <span className={styles.optionText}>{t.unlockWithText}</span>
          </span>
          <Toggle
            on={useBiometric}
            label={t.unlockWith(BIOMETRIC_NAMES[biometric])}
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
            {words.common.back}
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={!canCreate && !created}>
          {created ? words.common.continue : busy ? t.creating : t.create}
        </Button>
      </div>

      <dialog
        ref={weakDialog}
        className={styles.dialog}
        aria-labelledby="weak-title"
      >
        <div className={styles.heading}>
          <h2 id="weak-title" className={styles.dialogTitle}>
            {t.weakTitle}
          </h2>
          <p className={styles.dialogText}>{t.weakText}</p>
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
            {t.useAnyway}
          </Button>
          <Button
            ref={strongerButton}
            size="sm"
            onClick={() => weakDialog.current?.close()}
          >
            {t.makeStronger}
          </Button>
        </div>
      </dialog>
    </form>
  )
}
