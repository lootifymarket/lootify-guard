import { useRef, useState } from 'react'
import { importMaFiles, type ImportReport } from '../../api/accounts.ts'
import { errorMessage } from '../../api/vault.ts'
import Button from '../../components/Button.tsx'
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
  const dialog = useRef<HTMLDialogElement>(null)

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
    dialog.current?.showModal()
    // showModal() focuses "Done" and WebKit draws its focus ring right away. Focusing
    // the dialog itself keeps the ring for when the user actually tabs to the button.
    dialog.current?.focus()
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
      <dialog
        ref={dialog}
        tabIndex={-1}
        className={styles.dialog}
        aria-labelledby="import-title"
      >
        <h2 id="import-title" className={styles.title}>
          Import .maFile
        </h2>
        {result && 'error' in result && (
          <p className={styles.text} data-tone="danger">
            {result.error}
          </p>
        )}
        {result && 'report' in result && <Report report={result.report} />}
        <div className={styles.actions}>
          <Button size="sm" onClick={() => dialog.current?.close()}>
            Done
          </Button>
        </div>
      </dialog>
    </>
  )
}

function Report({ report }: { report: ImportReport }) {
  const added = report.added.length
  return (
    <>
      <p className={styles.text}>
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
            <span data-tone="faint">Already added</span>
          </li>
        ))}
        {report.failed.map((failure) => (
          <li key={`failed-${failure.file}`} className={styles.file}>
            <span className={styles.fileName}>{failure.file}</span>
            <span data-tone="danger">{failure.reason}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
