import type { Group } from '../../../api/accounts.ts'
import type { DropdownOption } from '../../../components/Dropdown.tsx'

/**
 * A group filter as a dropdown keeps it: '' for every account, 'none' for the
 * ones in no group, or a group's id as text.
 */
export function inGroup(groupId: number | null, filter: string) {
  if (filter === '') return true
  if (filter === 'none') return groupId === null
  return groupId === Number(filter)
}

export function groupOptions(groups: Group[]): DropdownOption[] {
  return [
    { value: '', label: 'All groups' },
    ...groups.map((group) => ({
      value: String(group.id),
      label: group.name,
      hint: `${group.count} ${group.count === 1 ? 'account' : 'accounts'}`,
    })),
    { value: 'none', label: 'No group' },
  ]
}
