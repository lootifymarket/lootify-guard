import { useEffect, useState } from 'react'
import {
  browserRegions,
  type Region,
  type RegionChoice,
} from '../../../api/browser.ts'

export const regionName = (region: Region) =>
  `${region.timeZone} · ${region.language}`

/** The region a choice comes to for a tab behind a proxy in `proxyCountry`. */
export function resolveRegion(
  regions: Region[],
  choice: RegionChoice,
  proxyCountry: string | null,
) {
  if (choice.kind === 'thisComputer') return null
  if (choice.kind === 'fixed') {
    return regions.find((region) => region.timeZone === choice.timeZone) ?? null
  }
  return (
    regions.find((region) => region.country === proxyCountry?.toUpperCase()) ??
    null
  )
}

/** Every region, once the backend has said them. */
export function useRegions() {
  const [regions, setRegions] = useState<Region[]>([])
  useEffect(() => {
    let active = true
    browserRegions().then(
      (next) => {
        if (active) setRegions(next)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [])
  return regions
}
