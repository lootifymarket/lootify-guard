import { languageInUse, type Language } from '../index.ts'
import { BACKEND_MESSAGES, type BackendMessage } from './en.ts'
import { backend as ru } from './ru.ts'
import { backend as uk } from './uk.ts'
import { backend as zh } from './zh.ts'

const CATALOGS: Record<
  Exclude<Language, 'en'>,
  Record<BackendMessage, string>
> = { ru, uk, zh }

type Rule = { pattern: RegExp; template: string }

const compiled = new Map<Language, Rule[]>()

// A message is built from others at most this deep; past it, it's left as is.
const MAX_DEPTH = 4

/**
 * A message from the Rust side in the app's language. It knows the messages by
 * their English words; one it doesn't know is shown as it came.
 */
export function fromBackend(text: string) {
  const language = languageInUse()
  if (language === 'en') return text
  return translate(text, rulesFor(language), 0)
}

function rulesFor(language: Exclude<Language, 'en'>) {
  let rules = compiled.get(language)
  if (!rules) {
    const catalog = CATALOGS[language]
    rules = [...BACKEND_MESSAGES]
      // The most specific first, so "Steam said: {}" wins over "{} failed: {}".
      .sort((a, b) => literalLength(b) - literalLength(a))
      .map((message) => ({
        pattern: new RegExp(
          `^${escape(message).replaceAll('\\{\\}', '(.+?)')}$`,
        ),
        template: catalog[message],
      }))
    compiled.set(language, rules)
  }
  return rules
}

// Notes join several findings, like "VAC banned, limited".
const SEPARATORS = ['; ', ', ']

function translate(text: string, rules: Rule[], depth: number): string {
  if (depth > MAX_DEPTH || text === '') return text
  const known = whole(text, rules, depth) ?? apply(text, rules, depth, false)
  if (known !== null) return known
  // "storage_01: Steam's servers are busy…": a name, then what it said.
  const colon = text.indexOf(': ')
  if (colon > 0) {
    const rest = text.slice(colon + 2)
    const translated = translate(rest, rules, depth + 1)
    if (translated !== rest) return `${text.slice(0, colon + 2)}${translated}`
  }
  return text
}

/**
 * The translation when every part of the text is a known message, or `null`.
 * A filled-in part that holds a separator must be known too, so a note like
 * "Web API key for x.com, VAC banned" splits into two findings instead of
 * taking "x.com, VAC banned" for the site.
 */
function whole(text: string, rules: Rule[], depth: number): string | null {
  if (depth > MAX_DEPTH) return null
  const found = withCase(text, (form) => apply(form, rules, depth, true))
  if (found !== null) return found
  for (const separator of SEPARATORS) {
    if (!text.includes(separator)) continue
    const parts = segments(text.split(separator), 0, separator, rules, depth)
    if (parts) return parts.join(separator)
  }
  return null
}

/** Splits the parts into runs that are each a known message; some hold a separator themselves. */
function segments(
  parts: string[],
  start: number,
  separator: string,
  rules: Rule[],
  depth: number,
): string[] | null {
  if (start === parts.length) return []
  for (let end = parts.length; end > start; end--) {
    if (start === 0 && end === parts.length) continue
    const piece = whole(
      parts.slice(start, end).join(separator),
      rules,
      depth + 1,
    )
    if (piece === null) continue
    const rest = segments(parts, end, separator, rules, depth)
    if (rest) return [piece, ...rest]
  }
  return null
}

/** Steam's words come capitalized where they start a sentence. */
function withCase(text: string, find: (form: string) => string | null) {
  const found = find(text)
  if (found !== null) return found
  const lowered = text[0].toLowerCase() + text.slice(1)
  if (lowered === text) return null
  const loweredFound = find(lowered)
  return loweredFound === null
    ? null
    : loweredFound[0].toUpperCase() + loweredFound.slice(1)
}

function apply(text: string, rules: Rule[], depth: number, strict: boolean) {
  for (const rule of rules) {
    const match = rule.pattern.exec(text)
    if (!match) continue
    const filled = match.slice(1)
    if (
      strict &&
      filled.some(
        (part) =>
          SEPARATORS.some((separator) => part.includes(separator)) &&
          whole(part, rules, depth + 1) === null,
      )
    ) {
      continue
    }
    let next = 0
    return rule.template.replaceAll('{}', () =>
      translate(filled[next++] ?? '', rules, depth + 1),
    )
  }
  return null
}

function literalLength(message: string) {
  return message.replaceAll('{}', '').length
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
