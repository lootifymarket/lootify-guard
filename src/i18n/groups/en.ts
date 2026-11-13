export const groups = {
  allGroups: 'All groups',
  noGroup: 'No group',
  accountCount: (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'}`,
  editGroup: 'Edit group',
  newGroup: 'New group',
  deleteText: (name: string, count: number) =>
    `${name} goes away. Its ${count} ${count === 1 ? 'account stays' : 'accounts stay'}, in no group.`,
  deleteGroup: 'Delete group',
  name: 'Name',
  namePlaceholder: 'Farm, Storage, Market makers…',
  accounts: (n: number) => `Accounts · ${n}`,
  findAccount: 'Find account',
  movesFrom: (group: string) => `moves from ${group}`,
  inGroup: (group: string) => `in ${group}`,
  delete: 'Delete',
  createGroup: 'Create group',
}
