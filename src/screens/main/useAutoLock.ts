import { useEffect, useEffectEvent, useState } from 'react'
import { autoLockDeadline, isLocked, reportActivity } from '../../api/vault.ts'

const REPORT_EVERY_MS = 15_000
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel']

/**
 * Tells the backend the user is still here and notices when it has locked the
 * vault. The backend owns the timer; this only keeps it informed. Returns when the
 * vault locks, in Unix seconds, or `null` when it never locks by itself.
 * A new `version` asks again, for when the auto-lock time changed.
 */
export function useAutoLock(onLocked: () => void, version: number) {
  const [deadline, setDeadline] = useState<number | null>(null)
  const locked = useEffectEvent(onLocked)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastReport = 0

    async function sync(request: () => Promise<number | null>) {
      try {
        const next = await request()
        if (!active) return
        setDeadline(next)
        clearTimeout(timer)
        if (next === null) return
        // Check again just past the deadline, when the backend has locked.
        timer = setTimeout(
          () => void sync(autoLockDeadline),
          next * 1000 - Date.now() + 1000,
        )
      } catch (err) {
        if (active && isLocked(err)) locked()
      }
    }

    function onActivity() {
      if (Date.now() - lastReport < REPORT_EVERY_MS) return
      lastReport = Date.now()
      void sync(reportActivity)
    }

    // After sleep, timers in the page can fire late or not at all, so returning
    // to the window checks too.
    function onVisible() {
      if (!document.hidden) void sync(autoLockDeadline)
    }

    onActivity()
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [version])

  return deadline
}
