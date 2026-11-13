import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ToastContext } from '../lib/toast.ts'
import styles from './Toasts.module.css'

const SHOWN_FOR_MS = 2400

type Toast = { id: number; text: string }

/** Gives the screens inside it `useToast`; a new note replaces the one showing. */
export default function Toasts({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), SHOWN_FOR_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const show = useCallback(
    (text: string) => setToast((last) => ({ id: (last?.id ?? 0) + 1, text })),
    [],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.place} role="status">
        {toast && (
          <span key={toast.id} className={`${styles.toast} rise`}>
            {toast.text}
          </span>
        )}
      </div>
    </ToastContext.Provider>
  )
}
