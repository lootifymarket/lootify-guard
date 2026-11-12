import { hasFlag } from 'country-flag-icons'
import * as flags from 'country-flag-icons/react/3x2'
import { countryName } from '../lib/countries.ts'
import styles from './Flag.module.css'

// Emoji flags don't render on Windows, hence images.
export default function Flag({ code }: { code: string }) {
  if (!hasFlag(code)) return <span className={styles.code}>{code}</span>
  const Image = flags[code as keyof typeof flags]
  return <Image className={styles.flag} title={countryName(code)} />
}
