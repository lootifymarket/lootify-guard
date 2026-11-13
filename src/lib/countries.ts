import { languageInUse } from '../i18n/index.ts'

const regionNames = new Map<string, Intl.DisplayNames>()

/** Country name for a two-letter code in the app's language, or the code itself. */
export function countryName(code: string) {
  const language = languageInUse()
  let names = regionNames.get(language)
  if (!names) {
    names = new Intl.DisplayNames([language], { type: 'region' })
    regionNames.set(language, names)
  }
  return names.of(code) ?? code
}
