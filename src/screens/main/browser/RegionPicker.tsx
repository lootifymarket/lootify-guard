import type { RegionChoice } from '../../../api/browser.ts'
import Dropdown from '../../../components/Dropdown.tsx'
import { useT } from '../../../i18n/index.ts'
import { regionName, resolveRegion, useRegions } from './regions.ts'

const MATCH = 'match'
const COMPUTER = 'computer'

type Props = {
  value: RegionChoice
  /** Where the tab's proxy comes out, to name what matching it means. */
  proxyCountry: string | null
  onChange: (value: RegionChoice) => void
  size?: 'md' | 'sm'
  hideLabel?: boolean
}

/** The time zone and language a browser tab shows pages. */
export default function RegionPicker({
  value,
  proxyCountry,
  onChange,
  size = 'md',
  hideLabel = false,
}: Props) {
  const t = useT().browser
  const regions = useRegions()
  const matched = resolveRegion(regions, { kind: 'matchProxy' }, proxyCountry)
  const current =
    value.kind === 'matchProxy'
      ? MATCH
      : value.kind === 'thisComputer'
        ? COMPUTER
        : value.timeZone

  return (
    <Dropdown
      label={t.region}
      hideLabel={hideLabel}
      size={size}
      value={current}
      options={[
        {
          value: MATCH,
          label: matched
            ? `${t.matchProxy} · ${regionName(matched)}`
            : t.matchProxyUnknown,
        },
        { value: COMPUTER, label: t.thisComputer },
        ...regions.map((region) => ({
          value: region.timeZone,
          label: regionName(region),
        })),
      ]}
      onChange={(next) =>
        onChange(
          next === MATCH
            ? { kind: 'matchProxy' }
            : next === COMPUTER
              ? { kind: 'thisComputer' }
              : { kind: 'fixed', timeZone: next },
        )
      }
    />
  )
}
