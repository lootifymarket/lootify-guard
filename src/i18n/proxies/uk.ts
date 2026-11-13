import { plural } from '../plural.ts'
import type { proxies as en } from './en.ts'

export const proxies: typeof en = {
  title: 'Проксі',
  summary: (proxies, accounts) =>
    `${proxies} проксі · ${accounts} ${plural('uk', accounts, { one: 'акаунт', few: 'акаунти', other: 'акаунтів' })} на них`,
  checking: 'Перевіряємо…',
  checkAll: 'Перевірити всі',
  add: 'Додати',
  list: 'Список проксі',
  columns: {
    proxy: 'Проксі',
    type: 'Тип',
    country: 'Країна',
    ping: 'Пінг',
    accounts: 'Акаунти',
    status: 'Статус',
  },
  empty: 'Проксі поки немає. Додайте один або вставте список праворуч.',
  ms: (ms) => `${ms} мс`,
  notChecked: 'Не перевірено',
  working: 'Працює',
  notResponding: 'Не відповідає',
  notRespondingCount: (n) => `не відповідають: ${n}`,
  allWorking: 'усі працюють',
  checked: (n) => `Перевірено проксі: ${n}`,
  checkComplete: 'Перевірку завершено',
  added: 'Проксі додано',
  deleted: 'Проксі видалено',

  details: {
    withLogin: ' · з логіном',
    noAccounts: 'Цей проксі не використовує жоден акаунт.',
    deleteWarning: (n) =>
      n === 1
        ? 'Якщо видалити його, цей акаунт не зможе звертатися до Steam, доки ви не дасте йому інший проксі. Через ваш власний IP нічого не піде.'
        : 'Якщо видалити його, ці акаунти не зможуть звертатися до Steam, доки ви не дасте їм інший проксі. Через ваш власний IP нічого не піде.',
    close: 'Закрити',
    delete: 'Видалити проксі',
    check: 'Перевірити',
  },

  bulk: {
    title: 'Масовий імпорт',
    import: 'Імпорт',
    importLines: (n) => `Імпортувати ${n}`,
    added: (n) => `Додано: ${n}`,
    alreadyAdded: (n) => `${n} уже в списку`,
    line: (line, reason) => `Рядок ${line}: ${reason}`,
  },

  form: {
    title: 'Додати проксі',
    alreadyAdded: 'Цей проксі вже є в списку',
    link: 'Посилання',
    linkHint:
      'Вставте повне посилання, щоб заповнити поля нижче, або введіть їх вручну.',
    name: 'Назва',
    namePlaceholder: 'Необов’язково, показується замість адреси',
    type: 'Тип',
    host: 'Хост',
    port: 'Порт',
    login: 'Логін',
    password: 'Пароль',
    test: 'Перевірити з’єднання',
    connected: (ms) => `Підключено · ${ms} мс`,
    add: 'Додати',
  },
}
