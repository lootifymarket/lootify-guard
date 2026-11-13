import { invoke } from '@tauri-apps/api/core'

/** Makes a group with these accounts, taking them out of any other. */
export const createGroup = (name: string, accountNames: string[]) =>
  invoke<number>('create_group', { name, accountNames })

export const renameGroup = (id: number, name: string) =>
  invoke<void>('rename_group', { id, name })

/** Its accounts stay, in no group. */
export const removeGroup = (id: number) => invoke<void>('remove_group', { id })

/** `null` takes the accounts out of their group. */
export const setAccountGroup = (
  accountNames: string[],
  groupId: number | null,
) => invoke<void>('set_account_group', { accountNames, groupId })
