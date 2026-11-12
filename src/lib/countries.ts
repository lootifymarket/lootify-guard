const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Country name for a two-letter code, falling back to the code itself. */
export function countryName(code: string) {
  return regionNames.of(code) ?? code
}
