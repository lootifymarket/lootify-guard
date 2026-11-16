import { useEffect, useState } from 'react'
import { updateStatus, type UpdateStatus } from '../../api/updates.ts'

// A download moves quickly; otherwise the status changes every few hours.
const MOVING_EVERY_MS = 500
const RESTING_EVERY_MS = 30_000

/** Where the next version stands, kept current. `refresh` asks again at once. */
export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'notChecked' })
  const [asked, setAsked] = useState(0)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = () =>
      updateStatus().then(
        (next) => {
          if (!active) return
          setStatus(next)
          const moving =
            next.state === 'downloading' || next.state === 'checking'
          timer = setTimeout(read, moving ? MOVING_EVERY_MS : RESTING_EVERY_MS)
        },
        () => {
          if (active) timer = setTimeout(read, RESTING_EVERY_MS)
        },
      )
    void read()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [asked])

  return { status, refresh: () => setAsked((n) => n + 1) }
}
