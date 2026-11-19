import type { Group } from '../../../api/accounts.ts'
import type { DropdownOption } from '../../../components/Dropdown.tsx'
import { words } from '../../../i18n/index.ts'

/**
 * A group filter as a dropdown keeps it: '' for every account, 'none' for the
 * ones in no group, or a group's id as text.
 */
export function inGroup(groupIds: number[], filter: string) {
  if (filter === '') return true
  if (filter === 'none') return groupIds.length === 0
  return groupIds.includes(Number(filter))
}

export function groupOptions(groups: Group[]): DropdownOption[] {
  const t = words().groups
  return [
    { value: '', label: t.allGroups },
    ...groups.map((group) => ({
      value: String(group.id),
      label: group.name,
      hint: t.accountCount(group.count),
    })),
    { value: 'none', label: t.noGroup },
  ]
}
