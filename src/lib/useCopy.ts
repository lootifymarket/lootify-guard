import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.ts'

const SHOWN_FOR_MS = 2000

type Result = { key: string; ok: boolean }

/** Copies text and remembers the outcome for a moment, so the UI can say how it went. */
export function useCopy() {
  const t = useT().common
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (result === null) return
    const timer = setTimeout(() => setResult(null), SHOWN_FOR_MS)
    return () => clearTimeout(timer)
  }, [result])

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setResult({ key, ok: true })
    } catch {
      setResult({ key, ok: false })
    }
  }

  return {
    copy: (key: string, text: string) => void copy(key, text),
    label: (key: string, idle: string) =>
      result?.key === key ? (result.ok ? t.copied : t.copyFailed) : idle,
  }
}
