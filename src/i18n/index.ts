import { createContext, useContext } from 'react'
import { en, type Dictionary } from './en.ts'
import { ru } from './ru.ts'
import { uk } from './uk.ts'
import { zh } from './zh.ts'

export type { Dictionary }

export type Language = 'en' | 'ru' | 'uk' | 'zh'

/** Each language by its own name, so anyone can find theirs. */
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'zh', label: '中文' },
]

export const DICTIONARIES: Record<Language, Dictionary> = { en, ru, uk, zh }

type LanguageState = {
  language: Language
  t: Dictionary
  setLanguage: (language: Language) => void
}

export const LanguageContext = createContext<LanguageState>({
  language: 'en',
  t: en,
  setLanguage: () => {},
})

/** The words in the language the user picked. */
export const useT = () => useContext(LanguageContext).t

export const useLanguage = () => useContext(LanguageContext)

let currentLanguage: Language = 'en'

/**
 * The words for code outside components, like error messages, which are made
 * in many places that have no hook at hand. Kept in step by the app's root.
 */
export const words = () => DICTIONARIES[currentLanguage]

/** The language in use, for code outside components that formats for it. */
export const languageInUse = () => currentLanguage

export function setWordsFor(language: Language) {
  currentLanguage = language
}
