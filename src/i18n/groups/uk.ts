import { plural } from '../plural.ts'
import type { groups as en } from './en.ts'

const accounts = (n: number) =>
  `${n} ${plural('uk', n, { one: 'акаунт', few: 'акаунти', many: 'акаунтів', other: 'акаунта' })}`

export const groups: typeof en = {
  allGroups: 'Усі групи',
  noGroup: 'Без групи',
  accountCount: accounts,
  editGroup: 'Змінити групу',
  newGroup: 'Нова група',
  deleteText: (name, count) =>
    `Групу ${name} буде видалено. Її ${accounts(count)} ${plural('uk', count, { one: 'залишиться', other: 'залишаться' })} без групи.`,
  deleteGroup: 'Видалити групу',
  name: 'Назва',
  namePlaceholder: 'Ферма, Склад, Маркет-мейкери…',
  accounts: (n) => `Акаунти · ${n}`,
  findAccount: 'Знайти акаунт',
  movesFrom: (group) => `перейде з ${group}`,
  inGroup: (group) => `у ${group}`,
  delete: 'Видалити',
  createGroup: 'Створити групу',
}
