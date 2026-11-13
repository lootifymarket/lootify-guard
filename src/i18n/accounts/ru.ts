import { plural } from '../plural.ts'
import type { accounts as en } from './en.ts'

export const accounts: typeof en = {
  title: 'Аккаунты',
  emptyTitle: 'Аккаунтов пока нет',
  emptyText:
    'Войдите в аккаунт, чтобы добавить его и настроить здесь Steam Guard, или импортируйте файлы .maFile из Steam Desktop Authenticator, ASF или steamguard-cli. Их секреты хранятся только в этом хранилище.',
  add: 'Добавить аккаунт',
  search: 'Поиск аккаунтов',
  searchPlaceholder: 'Логин или Steam ID',
  groups: 'Группы',
  all: 'Все',
  noGroup: 'Без группы',
  newGroup: '+ Новая группа',
  editGroup: (name) => `Изменить «${name}»`,
  playing: 'В игре',
  view: 'Открыть',
  viewAccount: (name) => `Открыть ${name}`,
  nothingFound: 'Ничего не найдено.',
  copy: 'Копировать',
  refreshesIn: (seconds) => `Обновится через ${seconds} с`,
  importButton: 'Импорт .maFile',
  importTitle: 'Импорт .maFile',
  done: 'Готово',
  added: (n) =>
    `${plural('ru', n, { one: 'Добавлен', other: 'Добавлено' })} ${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}.`,
  noneAdded: 'Новых аккаунтов не добавлено.',
  fileAdded: 'Добавлен',
  fileAlreadyAdded: 'Уже был добавлен',
}
