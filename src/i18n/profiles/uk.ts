import { plural } from '../plural.ts'
import type { profiles as en } from './en.ts'

export const profiles: typeof en = {
  title: 'Профілі браузера',
  summary: (accounts, profiles) =>
    `${accounts} ${plural('uk', accounts, { one: 'Steam-акаунт', few: 'Steam-акаунти', other: 'Steam-акаунтів' })} · ${profiles} без Steam`,
  find: 'Знайти профіль або акаунт',
  withoutSteam: (n) => `Без Steam · ${n}`,
  steamAccounts: (n) => `Steam-акаунти · ${n}`,
  showAllAccounts: (n) =>
    `Показати всі ${n} ${plural('uk', n, { one: 'акаунт', few: 'акаунти', other: 'акаунтів' })}`,
  noMatches: 'Нічого з такою назвою.',
  signInFirst: 'Увійдіть у Steam, щоб відкрити вкладку акаунта',
  accountPage: 'Змінити на сторінці акаунта',
  accountProxy:
    'Проксі самого акаунта: вкладка і Steam завжди ходять з однієї адреси.',
  steamStays: 'Після очищення вкладка лишиться залогіненою в Steam.',
  close: 'Закрити',
  newProfile: 'Новий профіль',
  columns: {
    profile: 'Профіль',
    proxy: 'Проксі',
    region: 'Пояс · мова',
    signIns: 'Збережені входи',
    lastOpened: 'Відкривали',
  },
  noProxy: 'Без проксі',
  deletedProxy: 'Видалений проксі',
  sites: (n) =>
    `${n} ${plural('uk', n, { one: 'сайт', few: 'сайти', other: 'сайтів' })}`,
  nothingSaved: 'Поки нічого',
  never: 'Ніколи',
  ago: (when) => `${when} тому`,
  open: 'Відкрити',
  openName: (name) => `Відкрити ${name}`,
  edit: (name) => `Змінити ${name}`,
  emptyText:
    'Профіль — це вкладка браузера без Steam-акаунта, яка пам’ятає входи: спільна пошта, форум, магазин проксі. Вона завжди ходить через той самий проксі. Вкладки Steam-акаунтів — нижче.',
  note: 'Входи зберігаються як куки в зашифрованому сховищі й повертаються, коли профіль відкривається. На диску у відкритому вигляді нічого не лишається, а під час блокування сховища всі профілі закриваються.',
  dialog: {
    newTitle: 'Новий профіль',
    editTitle: 'Профіль',
    name: 'Назва',
    namePlaceholder: 'Спільна пошта',
    proxy: 'Проксі',
    proxyMoved:
      'Сайти бачили цей профіль зі старої адреси. З нової вони можуть попросити підтвердити вхід.',
    proxyNextTime:
      'Відкрита вкладка збереже старий проксі, доки її не закриють.',
    signIns: 'Збережені входи',
    clear: 'Очистити',
    delete: 'Видалити профіль',
    create: 'Створити й відкрити',
    save: 'Зберегти',
  },
  saved: 'Профіль збережено',
  deleted: 'Профіль видалено',
  cleared: 'Входи очищено',
}
