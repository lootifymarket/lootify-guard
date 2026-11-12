import { useId, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  hideLabel?: boolean
  invalid?: boolean
}

export default function TextField({
  label,
  hideLabel = false,
  invalid = false,
  className,
  ...rest
}: Props) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label
        htmlFor={id}
        className={hideLabel ? styles.hiddenLabel : styles.label}
      >
        {label}
      </label>
      <input
        id={id}
        className={[styles.input, className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
}
