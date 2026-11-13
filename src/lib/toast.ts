import { createContext, useContext } from 'react'

export const ToastContext = createContext<(text: string) => void>(() => {})

/** Shows a short note at the bottom right, like "Backup saved", for a moment. */
export const useToast = () => useContext(ToastContext)
