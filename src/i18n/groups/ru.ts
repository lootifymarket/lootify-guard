import { plural } from '../plural.ts'
import type { groups as en } from './en.ts'

const accounts = (n: number) =>
  `${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', many: 'аккаунтов', other: 'аккаунта' })}`

export const groups: typeof en = {
  allGroups: 'Все группы',
  noGroup: 'Без группы',
  accountCount: accounts,
  editGroup: 'Изменить группу',
  newGroup: 'Новая группа',
  deleteText: (name, count) =>
    `Группа ${name} удаляется. Её ${accounts(count)} ${plural('ru', count, { one: 'останется', other: 'останутся' })} без группы.`,
  deleteGroup: 'Удалить группу',
  name: 'Название',
  namePlaceholder: 'Ферма, Склад, Маркет-мейкеры…',
  accounts: (n) => `Аккаунты · ${n}`,
  findAccount: 'Найти аккаунт',
  movesFrom: (group) => `перейдёт из ${group}`,
  inGroup: (group) => `в ${group}`,
  delete: 'Удалить',
  createGroup: 'Создать группу',
}
