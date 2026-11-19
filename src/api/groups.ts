import { invoke } from '@tauri-apps/api/core'

/** The tints a group can have; the first is the plain one. */
export const GROUP_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

/** Makes a group with these accounts in it. They stay in their other groups. */
export const createGroup = (
  name: string,
  color: GroupColor,
  accountNames: string[],
) => invoke<number>('create_group', { name, color, accountNames })

export const updateGroup = (id: number, name: string, color: GroupColor) =>
  invoke<void>('update_group', { id, name, color })

/** Its accounts stay, in their other groups. */
export const removeGroup = (id: number) => invoke<void>('remove_group', { id })

/** The accounts keep their other groups. */
export const addToGroup = (accountNames: string[], groupId: number) =>
  invoke<void>('add_to_group', { accountNames, groupId })

export const removeFromGroup = (accountNames: string[], groupId: number) =>
  invoke<void>('remove_from_group', { accountNames, groupId })
