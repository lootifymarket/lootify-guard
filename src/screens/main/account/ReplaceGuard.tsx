import { useRef, useState, type FormEvent, type RefObject } from 'react'
import type { ConfirmBy } from '../../../api/addAccount.ts'
import {
  replaceGuardConfirm,
  replaceGuardStart,
  type ReplaceMethod,
  type Replaced,
} from '../../../api/replaceGuard.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import TextField from '../../../components/TextField.tsx'
import { useT, type Dictionary } from '../../../i18n/index.ts'
import { useCopy } from '../../../lib/useCopy.ts'
import styles from './AccountPage.module.css'

type Props = {
  open: boolean
  hasRevocationCode: boolean
  /** Steam shows an authenticator on the account; without one a new one is just added. */
  guardOn: boolean
  onClose: () => void
  /** The vault holds the new secrets now. */
  onReplaced: () => void
  onSignOut: () => void
}

type Step =
  | { name: 'how' }
  | { name: 'code'; method: ReplaceMethod; by: ConfirmBy }
  | { name: 'done'; replaced: Replaced }

/**
 * Swaps the account's authenticator for a new one, so copies of the old secrets
 * stop working. The owner is confirmed before this opens.
 */
export default function ReplaceGuard({ open, onClose, ...rest }: Props) {
  const t = useT().account.replaceGuard
  const codeField = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open={open}
      title={rest.guardOn ? t.title : t.addTitle}
      onClose={onClose}
      initialFocus={codeField}
    >
      {open && <Flow {...rest} codeField={codeField} onClose={onClose} />}
    </Dialog>
  )
}

function Flow({
  hasRevocationCode,
  guardOn,
  codeField,
  onClose,
  onReplaced,
  onSignOut,
}: Omit<Props, 'open'> & { codeField: RefObject<HTMLInputElement | null> }) {
  const [step, setStep] = useState<Step>({ name: 'how' })

  if (step.name === 'how') {
    return (
      <How
        hasRevocationCode={hasRevocationCode}
        guardOn={guardOn}
        onCancel={onClose}
        onSent={(method, by) => setStep({ name: 'code', method, by })}
      />
    )
  }
  if (step.name === 'code') {
    return (
      <Code
        method={step.method}
        by={step.by}
        field={codeField}
        onCancel={onClose}
        onReplaced={(replaced) => {
          setStep({ name: 'done', replaced })
          onReplaced()
        }}
      />
    )
  }
  return (
    <Done replaced={step.replaced} onSignOut={onSignOut} onDone={onClose} />
  )
}

function How({
  hasRevocationCode,
  guardOn,
  onCancel,
  onSent,
}: {
  hasRevocationCode: boolean
  guardOn: boolean
  onCancel: () => void
  onSent: (method: ReplaceMethod, by: ConfirmBy) => void
}) {
  const words = useT()
  const t = words.account.replaceGuard
  const [busy, setBusy] = useState<ReplaceMethod | null>(null)
  const [error, setError] = useState('')

  async function start(method: ReplaceMethod) {
    setBusy(method)
    setError('')
    try {
      onSent(method, await replaceGuardStart(method))
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <>
      <p className={dialogStyles.text}>
        {!guardOn ? t.noGuard : hasRevocationCode ? t.methods : t.smsOnly}
      </p>
      <p className={styles.muted}>{t.tradeHold}</p>
      {error && (
        <p className={dialogStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        {guardOn && hasRevocationCode && (
          <Button
            variant="secondary"
            size="sm"
            busy={busy === 'revocationCode'}
            disabled={busy !== null}
            onClick={() => void start('revocationCode')}
          >
            {t.useRevocationCode}
          </Button>
        )}
        <div className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {words.common.cancel}
          </Button>
          <Button
            size="sm"
            busy={busy === 'sms'}
            disabled={busy !== null}
            onClick={() => void start('sms')}
          >
            {busy === 'sms' ? t.askingSteam : guardOn ? t.sendSms : t.addGuard}
          </Button>
        </div>
      </div>
    </>
  )
}

function Code({
  method,
  by,
  field,
  onCancel,
  onReplaced,
}: {
  method: ReplaceMethod
  by: ConfirmBy
  field: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onReplaced: (replaced: Replaced) => void
}) {
  const words = useT()
  const t = words.account.replaceGuard
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!code || busy) return
    setBusy(true)
    setError('')
    try {
      onReplaced(await replaceGuardConfirm(code))
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <p className={dialogStyles.text}>{codeText(t, by)}</p>
      {method === 'revocationCode' && (
        <p className={styles.ruleWarning}>{t.guardIsOff}</p>
      )}
      <TextField
        ref={field}
        label={t.code}
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
          {words.common.cancel}
        </Button>
        <Button type="submit" size="sm" busy={busy} disabled={!code || busy}>
          {busy ? t.checking : t.confirm}
        </Button>
      </div>
    </form>
  )
}

function Done({
  replaced,
  onSignOut,
  onDone,
}: {
  replaced: Replaced
  onSignOut: () => void
  onDone: () => void
}) {
  const t = useT().account.replaceGuard
  const { copy, label } = useCopy()
  const code = replaced.revocationCode

  return (
    <>
      {replaced.guardOn ? (
        <p className={dialogStyles.text}>{t.replaced}</p>
      ) : (
        <p className={styles.ruleWarning}>{t.notOnYet}</p>
      )}
      {code ? (
        <>
          <span className={styles.newCode}>{code}</span>
          <p className={styles.muted}>{t.newRevocationCode}</p>
        </>
      ) : (
        <p className={styles.muted}>{t.noRevocationCode}</p>
      )}
      <p className={dialogStyles.text}>{t.signOutHint}</p>
      <div className={styles.formActions}>
        {code && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy('revocation', code)}
          >
            {label('revocation', t.copyCode)}
          </Button>
        )}
        <div className={dialogStyles.actions}>
          <Button variant="secondary" size="sm" onClick={onSignOut}>
            {t.signOutEverywhere}
          </Button>
          <Button size="sm" onClick={onDone}>
            {t.done}
          </Button>
        </div>
      </div>
    </>
  )
}

function codeText(t: Dictionary['account']['replaceGuard'], by: ConfirmBy) {
  if (by.by === 'email') return t.emailText
  return t.smsText(by.phoneHint ? t.phoneEnding(by.phoneHint) : t.accountPhone)
}
