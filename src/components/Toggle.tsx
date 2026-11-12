import styles from './Toggle.module.css'

type Props = {
  on: boolean
  label: string
  onChange: (on: boolean) => void
}

export default function Toggle({ on, label, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={styles.toggle}
      onClick={() => onChange(!on)}
    >
      <span className={styles.knob} />
    </button>
  )
}
