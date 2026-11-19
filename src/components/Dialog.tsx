import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import styles from './Dialog.module.css'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  /** Focused on open. Without it the dialog itself takes focus. */
  initialFocus?: RefObject<HTMLElement | null>
  /** For tables that need more room than a short form. */
  wide?: boolean
  children: ReactNode
}

export default function Dialog({
  open,
  title,
  onClose,
  initialFocus,
  wide = false,
  children,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // The close event also comes after `open` turns false, by which time another
  // dialog may be opening. Only a close the user made is reported.
  const shown = useRef(open)

  useEffect(() => {
    shown.current = open
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      // showModal() focuses the first button, and WebKit draws its focus ring
      // even after a mouse click. Focusing the dialog keeps the ring for Tab.
      ;(initialFocus?.current ?? element).focus()
    } else if (!open && element.open) {
      element.close()
    }
  }, [open, initialFocus])

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
      aria-labelledby={titleId}
      onClose={() => {
        if (shown.current) onClose()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {/* Mounted only while open, so every opening starts from a clean state. */}
      {open && children}
    </dialog>
  )
}
