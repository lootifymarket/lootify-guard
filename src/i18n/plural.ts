type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const rules = new Map<string, Intl.PluralRules>()

/**
 * The form of a word that goes with `count`, by the language's own rules, like
 * Russian "1 аккаунт", "2 аккаунта", "5 аккаунтов".
 */
export function plural(language: string, count: number, forms: Forms) {
  let rule = rules.get(language)
  if (!rule) {
    rule = new Intl.PluralRules(language)
    rules.set(language, rule)
  }
  return forms[rule.select(count)] ?? forms.other
}
