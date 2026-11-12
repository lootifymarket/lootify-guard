import { useId, useState } from 'react'
import { addProxies, type AddReport } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import styles from './Proxies.module.css'

type Props = {
  onImported: () => void
}

export default function BulkImport({ onImported }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<AddReport | null>(null)
  const [error, setError] = useState('')
  const id = useId()
  const lines = text.split('\n').filter((line) => line.trim() !== '').length

  async function run() {
    setBusy(true)
    setError('')
    setReport(null)
    try {
      const next = await addProxies(text)
      setReport(next)
      // Lines that failed stay, so they can be fixed and imported again.
      if (next.failed.length === 0) setText('')
      if (next.added > 0) onImported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.bulk}>
      <label htmlFor={id} className={styles.bulkLabel}>
        Bulk import
      </label>
      <textarea
        id={id}
        rows={6}
        className={styles.textarea}
        placeholder={
          'socks5://user:pass@host:port\nhttp://host:port\nhost:port:user:pass'
        }
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        variant="secondary"
        size="sm"
        className={styles.bulkButton}
        busy={busy}
        disabled={lines === 0 || busy}
        onClick={() => void run()}
      >
        {lines > 0 ? `Import ${lines}` : 'Import'}
      </Button>
      {report && (
        <div className={styles.bulkReport} role="status">
          <span>
            Added {report.added}
            {report.alreadyAdded > 0 &&
              ` · ${report.alreadyAdded} already in the list`}
          </span>
          {report.failed.map((failure) => (
            <span key={failure.line} className={styles.error}>
              Line {failure.line}: {failure.reason}
            </span>
          ))}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
