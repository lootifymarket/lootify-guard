import { useState } from 'react'
import { importMaFiles, type ImportReport } from '../../api/accounts.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
import Dialog from '../../components/Dialog.tsx'
import dialogStyles from '../../components/Dialog.module.css'
import styles from './ImportMaFiles.module.css'

type Result = { report: ImportReport } | { error: string }

type Props = {
  variant: 'primary' | 'secondary'
  onImported: () => void
}

/** The import button and the dialog that reports what came of it. */
export default function ImportMaFiles({ variant, onImported }: Props) {
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
        Import .maFile
      </Button>
      <Dialog
        open={result !== null}
        title="Import .maFile"
        onClose={() => setResult(null)}
      >
        {result && 'error' in result && (
          <p className={dialogStyles.error}>{result.error}</p>
        )}
        {result && 'report' in result && <Report report={result.report} />}
        <div className={dialogStyles.actions}>
          <Button size="sm" onClick={() => setResult(null)}>
            Done
          </Button>
        </div>
      </Dialog>
    </>
  )
}

function Report({ report }: { report: ImportReport }) {
  const added = report.added.length
  return (
    <>
      <p className={dialogStyles.text}>
        {added > 0
          ? `Added ${added} ${added === 1 ? 'account' : 'accounts'}.`
          : 'No new accounts were added.'}
      </p>
      <ul className={styles.files}>
        {report.added.map((name) => (
          <li key={`added-${name}`} className={styles.file}>
            <span>{name}</span>
            <span>Added</span>
          </li>
        ))}
        {report.alreadyAdded.map((name) => (
          <li key={`already-${name}`} className={styles.file}>
            <span>{name}</span>
            <span className={styles.faint}>Already added</span>
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
