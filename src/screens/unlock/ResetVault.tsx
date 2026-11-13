import { useState, type FormEvent } from 'react'
import { eraseVault, errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import TextField from '../../components/TextField.tsx'
import { useT } from '../../i18n/index.ts'
import styles from './Unlock.module.css'

type Props = {
  biometricName: string | null
  onErased: () => void
  onBack: () => void
}

export default function ResetVault({ biometricName, onErased, onBack }: Props) {
  const t = useT().unlock
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmed = confirmation.trim().toUpperCase() === t.resetWord

  async function erase(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    setError('')
    try {
      await eraseVault()
      onErased()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className={`${styles.view} ${styles.reset}`} onSubmit={erase}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{t.resetTitle}</h1>
        <p className={styles.text}>{t.resetText(biometricName)}</p>
      </div>
      <div className={styles.ways}>
        <span className={styles.waysTitle}>{t.waysTitle}</span>
        <ol className={styles.wayList}>
          {t.ways.map((way) => (
            <li key={way.title} className={styles.way}>
              <span className={styles.wayTitle}>{way.title}</span>
              <span className={styles.wayText}>{way.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <TextField
        label={t.typeReset}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        className={styles.confirmation}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button
        type="submit"
        variant="danger"
        busy={busy}
        disabled={!confirmed}
        className={styles.wide}
      >
        {busy ? t.erasing : t.erase}
      </Button>
      <button type="button" className={styles.back} onClick={onBack}>
        {t.remembered}
      </button>
    </form>
  )
}
