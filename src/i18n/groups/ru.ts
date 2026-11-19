import { plural } from '../plural.ts'
import type { groups as en } from './en.ts'

const accounts = (n: number) =>
  `${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', many: 'аккаунтов', other: 'аккаунта' })}`

export const groups: typeof en = {
  title: 'Группы',
  close: 'Закрыть',
  saved: 'Сохранено',
  noGroupsYet:
    'Групп пока нет. Сделайте группу, чтобы работать с аккаунтами вместе, например «Ферма» или «Склад».',
  color: 'Цвет',
  colors: {
    gray: 'Серый',
    red: 'Красный',
    orange: 'Оранжевый',
    yellow: 'Жёлтый',
    green: 'Зелёный',
    teal: 'Бирюзовый',
    blue: 'Синий',
    purple: 'Фиолетовый',
    pink: 'Розовый',
  },
  allGroups: 'Все группы',
  noGroup: 'Без группы',
  accountCount: accounts,
  editGroup: 'Изменить группу',
  newGroup: 'Новая группа',
  deleteText: (name, count) =>
    `Группа ${name} удаляется. Её ${accounts(count)} ${plural('ru', count, { one: 'останется', other: 'останутся' })} только не в этой группе.`,
  deleteGroup: 'Удалить группу',
  name: 'Название',
  namePlaceholder: 'Ферма, Склад, Маркет-мейкеры…',
  accounts: (n) => `Аккаунты · ${n}`,
  findAccount: 'Найти аккаунт',
  nothingFound: 'Ничего с таким именем.',
  delete: 'Удалить',
  createGroup: 'Создать группу',
  addToGroup: (account) => `Добавить ${account} в группу`,
  leaveGroup: (account, group) => `Убрать ${account} из ${group}`,
  newGroupItem: 'Новая группа…',
}
