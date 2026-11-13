import type { groups as en } from './en.ts'

export const groups: typeof en = {
  allGroups: '所有分组',
  noGroup: '未分组',
  accountCount: (n) => `${n} 个账户`,
  editGroup: '编辑分组',
  newGroup: '新建分组',
  deleteText: (name, count) =>
    `分组 ${name} 将被删除，其中的 ${count} 个账户会保留为未分组。`,
  deleteGroup: '删除分组',
  name: '名称',
  namePlaceholder: '农场、仓库、做市商…',
  accounts: (n) => `账户 · ${n}`,
  findAccount: '查找账户',
  movesFrom: (group) => `将从 ${group} 移出`,
  inGroup: (group) => `在 ${group} 中`,
  delete: '删除',
  createGroup: '创建分组',
}
