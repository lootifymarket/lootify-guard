import { useEffect, useEffectEvent, useState } from 'react'
import { appVersion } from '../api/settings.ts'
import LogoMark from '../components/LogoMark.tsx'
import { useT } from '../i18n/index.ts'
import styles from './Splash.module.css'

// When each step shows, in ms from the start, while the mark draws itself in.
const STEP_AT = [1000, 1350, 1700]
// The last step waits for the app to be ready, and stays a moment before fading.
const DONE_FOR = 300
const FADE = 450

type Props = {
  /** The vault's state is known, so the first screen can show. */
  ready: boolean
  onDone: () => void
}

/** The mark drawing itself in while the app finds the vault. */
export default function Splash({ ready, onDone }: Props) {
  const t = useT().splash
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [version, setVersion] = useState('')
  const [startedAt] = useState(() => Date.now())
  const done = useEffectEvent(onDone)

  useEffect(() => {
    void appVersion().then(setVersion)
    const timers = STEP_AT.slice(0, -1).map((at, i) =>
      setTimeout(() => setStep(i + 1), at),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // The last step is "Done", so it waits until the app really is.
  const last = STEP_AT.length
  useEffect(() => {
    if (!ready) return
    const wait = Math.max(0, STEP_AT[last - 1] - (Date.now() - startedAt))
    const timer = setTimeout(() => setStep(last), wait)
    return () => clearTimeout(timer)
  }, [ready, last, startedAt])

  useEffect(() => {
    if (step < last) return
    const leave = setTimeout(() => setLeaving(true), DONE_FOR)
    const finish = setTimeout(done, DONE_FOR + FADE)
    return () => {
      clearTimeout(leave)
      clearTimeout(finish)
    }
  }, [step, last])

  return (
    <div className={styles.screen} data-leaving={leaving}>
      <span className={styles.glow} aria-hidden="true" />
      <LogoMark size={84} animate />
      <span className={styles.words}>
        <span className={styles.name}>LOOTIFY</span>
        <span className={styles.product}>GUARD</span>
      </span>
      <span className={styles.progress}>
        <span className={styles.track}>
          <span
            className={styles.fill}
            style={{ width: `${(step / last) * 100}%` }}
          />
        </span>
        <span className={styles.step} role="status">
          {step > 0 ? t.steps[step - 1] : ''}
        </span>
      </span>
      <span className={styles.by}>
        {t.by}
        {version && <span className={styles.version}>· v{version}</span>}
      </span>
    </div>
  )
}
