import { plural } from '../plural.ts'
import type { groups as en } from './en.ts'

const accounts = (n: number) =>
  `${n} ${plural('uk', n, { one: 'акаунт', few: 'акаунти', many: 'акаунтів', other: 'акаунта' })}`

export const groups: typeof en = {
  title: 'Групи',
  close: 'Закрити',
  saved: 'Збережено',
  noGroupsYet:
    'Груп поки немає. Створіть групу, щоб працювати з акаунтами разом, наприклад «Ферма» чи «Склад».',
  color: 'Колір',
  colors: {
    gray: 'Сірий',
    red: 'Червоний',
    orange: 'Помаранчевий',
    yellow: 'Жовтий',
    green: 'Зелений',
    teal: 'Бірюзовий',
    blue: 'Синій',
    purple: 'Фіолетовий',
    pink: 'Рожевий',
  },
  allGroups: 'Усі групи',
  noGroup: 'Без групи',
  accountCount: accounts,
  editGroup: 'Змінити групу',
  newGroup: 'Нова група',
  deleteText: (name, count) =>
    `Групу ${name} буде видалено. Її ${accounts(count)} ${plural('uk', count, { one: 'залишиться', other: 'залишаться' })} тільки не в цій групі.`,
  deleteGroup: 'Видалити групу',
  name: 'Назва',
  namePlaceholder: 'Ферма, Склад, Маркет-мейкери…',
  accounts: (n) => `Акаунти · ${n}`,
  findAccount: 'Знайти акаунт',
  nothingFound: 'Нічого з такою назвою.',
  delete: 'Видалити',
  createGroup: 'Створити групу',
  addToGroup: (account) => `Додати ${account} до групи`,
  leaveGroup: (account, group) => `Прибрати ${account} з ${group}`,
  newGroupItem: 'Нова група…',
}
