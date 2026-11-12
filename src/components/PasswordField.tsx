import { useId, type InputHTMLAttributes } from 'react'
import styles from './PasswordField.module.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  label: string
  hideLabel?: boolean
  invalid?: boolean
}

export default function PasswordField({
  label,
  hideLabel = false,
  invalid = false,
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
        type="password"
        className={styles.input}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
}
