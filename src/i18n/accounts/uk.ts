import { plural } from '../plural.ts'
import type { accounts as en } from './en.ts'

export const accounts: typeof en = {
  title: 'Акаунти',
  emptyTitle: 'Акаунтів поки немає',
  emptyText:
    'Увійдіть в акаунт, щоб додати його й налаштувати тут Steam Guard, або імпортуйте файли .maFile зі Steam Desktop Authenticator, ASF чи steamguard-cli. Їхні секрети зберігаються лише в цьому сховищі.',
  add: 'Додати акаунт',
  search: 'Пошук акаунтів',
  searchPlaceholder: 'Логін або Steam ID',
  groups: 'Групи',
  all: 'Усі',
  noGroup: 'Без групи',
  newGroup: '+ Нова група',
  editGroup: (name) => `Змінити «${name}»`,
  playing: 'У грі',
  view: 'Відкрити',
  viewAccount: (name) => `Відкрити ${name}`,
  nothingFound: 'Нічого не знайдено.',
  copy: 'Копіювати',
  refreshesIn: (seconds) => `Оновиться за ${seconds} с`,
  importButton: 'Імпорт .maFile',
  importTitle: 'Імпорт .maFile',
  done: 'Готово',
  added: (n) =>
    `Додано ${n} ${plural('uk', n, { one: 'акаунт', few: 'акаунти', other: 'акаунтів' })}.`,
  noneAdded: 'Нових акаунтів не додано.',
  fileAdded: 'Додано',
  fileAlreadyAdded: 'Уже був доданий',
}
