import { useState } from 'react'
import { importMaFiles, type ImportReport } from '../../api/accounts.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import { useT } from '../../i18n/index.ts'
import styles from './ImportMaFiles.module.css'

type Result = { report: ImportReport } | { error: string }

type Props = {
  variant: 'primary' | 'secondary'
  onImported: () => void
}

/** The import button and the dialog that reports what came of it. */
export default function ImportMaFiles({ variant, onImported }: Props) {
  const t = useT().accounts
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function start() {
    setBusy(true)
    let next: Result
    try {
      const report = await importMaFiles()
      if (!report) return
      next = { report }
    } catch (err) {
      next = { error: errorMessage(err) }
    } finally {
      setBusy(false)
    }
    setResult(next)
    if ('report' in next && next.report.added.length > 0) onImported()
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        busy={busy}
        disabled={busy}
        onClick={() => void start()}
      >
        {t.importButton}
      </Button>
      <Dialog
        open={result !== null}
        title={t.importTitle}
        onClose={() => setResult(null)}
      >
        {result && 'error' in result && (
          <p className={dialogStyles.error}>{result.error}</p>
        )}
        {result && 'report' in result && <Report report={result.report} />}
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={() => setResult(null)}>
            {t.done}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

function Report({ report }: { report: ImportReport }) {
  const t = useT().accounts
  const added = report.added.length
  return (
    <>
      <p className={dialogStyles.text}>
        {added > 0 ? t.added(added) : t.noneAdded}
      </p>
      <ul className={styles.files}>
        {report.added.map((name) => (
          <li key={`added-${name}`} className={styles.file}>
            <span>{name}</span>
            <span>{t.fileAdded}</span>
          </li>
        ))}
        {report.alreadyAdded.map((name) => (
          <li key={`already-${name}`} className={styles.file}>
            <span>{name}</span>
            <span className={styles.faint}>{t.fileAlreadyAdded}</span>
          </li>
        ))}
        {report.failed.map((failure) => (
          <li key={`failed-${failure.file}`} className={styles.file}>
            <span className={styles.fileName}>{failure.file}</span>
            <span className={dialogStyles.error}>{failure.reason}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
