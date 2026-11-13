import { plural } from '../plural.ts'
import type { proxies as en } from './en.ts'

export const proxies: typeof en = {
  title: 'Прокси',
  summary: (proxies, accounts) =>
    `${proxies} прокси · ${accounts} ${plural('ru', accounts, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })} на них`,
  checking: 'Проверяем…',
  checkAll: 'Проверить все',
  add: 'Добавить',
  list: 'Список прокси',
  columns: {
    proxy: 'Прокси',
    type: 'Тип',
    country: 'Страна',
    ping: 'Пинг',
    accounts: 'Аккаунты',
    status: 'Статус',
  },
  checkOne: (proxy) => `Проверить ${proxy}`,
  check: 'Проверить',
  empty: 'Прокси пока нет. Добавьте один или вставьте список справа.',
  ms: (ms) => `${ms} мс`,
  notChecked: 'Не проверен',
  working: 'Работает',
  notResponding: 'Не отвечает',

  details: {
    withLogin: ' · с логином',
    noAccounts: 'Этот прокси не используется ни одним аккаунтом.',
    deleteWarning: (n) =>
      n === 1
        ? 'Если удалить его, этот аккаунт не сможет обращаться к Steam, пока вы не дадите ему другой прокси. Через ваш собственный IP ничего не пойдёт.'
        : 'Если удалить его, эти аккаунты не смогут обращаться к Steam, пока вы не дадите им другой прокси. Через ваш собственный IP ничего не пойдёт.',
    close: 'Закрыть',
    delete: 'Удалить прокси',
  },

  bulk: {
    title: 'Массовый импорт',
    import: 'Импорт',
    importLines: (n) => `Импортировать ${n}`,
    added: (n) => `Добавлено: ${n}`,
    alreadyAdded: (n) => ` · ${n} уже в списке`,
    line: (line, reason) => `Строка ${line}: ${reason}`,
  },

  form: {
    title: 'Добавить прокси',
    alreadyAdded: 'Этот прокси уже есть в списке',
    link: 'Ссылка',
    linkHint:
      'Вставьте полную ссылку, чтобы заполнить поля ниже, или введите их вручную.',
    name: 'Название',
    namePlaceholder: 'Необязательно, показывается вместо адреса',
    type: 'Тип',
    host: 'Хост',
    port: 'Порт',
    login: 'Логин',
    password: 'Пароль',
    test: 'Проверить соединение',
    connected: (ms) => `Подключено · ${ms} мс`,
    add: 'Добавить',
  },
}
