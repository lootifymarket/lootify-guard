export function checkPassword(password: string) {
  const rules = {
    length: password.length >= 12,
    numberOrSymbol: /[^\p{L}]/u.test(password),
    mixedCase: /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password),
  }
  const score = password
    ? Math.min(
        4,
        Number(password.length >= 8) +
          Number(rules.length) +
          Number(rules.numberOrSymbol) +
          Number(rules.mixedCase),
      )
    : 0
  const strong = rules.length && rules.numberOrSymbol && rules.mixedCase
  return { rules, score, strong }
}
