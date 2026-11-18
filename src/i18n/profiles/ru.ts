import { plural } from '../plural.ts'
import type { profiles as en } from './en.ts'

export const profiles: typeof en = {
  title: 'Профили браузера',
  summary: (accounts, profiles) =>
    `${accounts} ${plural('ru', accounts, { one: 'Steam-аккаунт', few: 'Steam-аккаунта', other: 'Steam-аккаунтов' })} · ${profiles} без Steam`,
  find: 'Найти профиль или аккаунт',
  withoutSteam: 'Без Steam',
  steamAccounts: 'Steam-аккаунты',
  noAccounts: 'Аккаунтов пока нет.',
  showAllAccounts: (n) =>
    `Показать все ${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}`,
  noMatches: 'Ничего с таким названием.',
  signInFirst: 'Войдите в Steam, чтобы открыть вкладку аккаунта',
  accountPage: 'Изменить на странице аккаунта',
  accountProxy:
    'Прокси самого аккаунта: вкладка и Steam всегда ходят с одного адреса.',
  steamStays: 'После очистки вкладка останется залогиненной в Steam.',
  close: 'Закрыть',
  newProfile: 'Новый профиль',
  columns: {
    profile: 'Профиль',
    proxy: 'Прокси',
    region: 'Пояс · язык',
    signIns: 'Сохранённые входы',
    lastOpened: 'Открывали',
  },
  noProxy: 'Без прокси',
  deletedProxy: 'Удалённый прокси',
  sites: (n) =>
    `${n} ${plural('ru', n, { one: 'сайт', few: 'сайта', other: 'сайтов' })}`,
  nothingSaved: 'Пока ничего',
  never: 'Никогда',
  ago: (when) => `${when} назад`,
  open: 'Открыть',
  openName: (name) => `Открыть ${name}`,
  edit: (name) => `Изменить ${name}`,
  emptyText:
    'Профиль — это вкладка браузера без Steam-аккаунта, которая помнит входы: общая почта, форум, магазин прокси. Она всегда ходит через один и тот же прокси. Вкладки Steam-аккаунтов — в разделе «Steam-аккаунты».',
  note: 'Входы хранятся как куки в зашифрованном хранилище и возвращаются, когда профиль открывается. На диске в открытом виде ничего не остаётся, а при блокировке хранилища все профили закрываются.',
  dialog: {
    newTitle: 'Новый профиль',
    editTitle: 'Профиль',
    name: 'Название',
    namePlaceholder: 'Общая почта',
    proxy: 'Прокси',
    proxyMoved:
      'Сайты видели этот профиль со старого адреса. С нового они могут попросить подтвердить вход.',
    proxyNextTime:
      'Открытая вкладка сохранит старый прокси, пока её не закроют.',
    signIns: 'Сохранённые входы',
    clear: 'Очистить',
    delete: 'Удалить профиль',
    create: 'Создать и открыть',
    save: 'Сохранить',
  },
  saved: 'Профиль сохранён',
  deleted: 'Профиль удалён',
  cleared: 'Входы очищены',
}
