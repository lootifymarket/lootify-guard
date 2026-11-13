import { words } from '../i18n/index.ts'

/** How long ago a Unix time was, in short words: "just now", "5 min", "3 h". */
export function ago(unixSeconds: number) {
  const t = words().time
  const minutes = Math.max(
    0,
    Math.round((Date.now() / 1000 - unixSeconds) / 60),
  )
  if (minutes < 1) return t.justNow
  if (minutes < 60) return t.minutes(minutes)
  const hours = Math.round(minutes / 60)
  return hours < 24 ? t.hours(hours) : t.days(Math.round(hours / 24))
}
