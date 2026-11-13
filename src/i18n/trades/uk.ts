import { plural } from '../plural.ts'
import type { trades as en } from './en.ts'

const items = (n: number) =>
  plural('uk', n, { one: 'предмет', few: 'предмети', other: 'предметів' })
const days = (n: number) =>
  plural('uk', n, { one: 'день', few: 'дні', other: 'днів' })

export const trades: typeof en = {
  title: 'Трейди',
  subtitle: 'Пропозиції обміну з усіх ваших акаунтів в одному списку',
  loading: 'Завантажуємо…',
  reload: 'Оновити',
  newTrade: 'Новий трейд',
  offersLabel: 'Пропозиції',
  tabs: {
    incoming: 'Вхідні',
    outgoing: 'Вихідні',
    history: 'Історія',
  },
  empty: {
    incoming: 'Немає пропозицій, які чекають на вас.',
    outgoing: 'Немає пропозицій, які чекають на інших.',
    history: 'За тиждень жодна пропозиція не завершилася.',
  },
  columns: {
    parties: 'Від кого → кому',
    give: 'Ви віддаєте',
    get: 'Ви отримуєте',
  },
  askingSteam: 'Питаємо Steam…',
  notShown: (names) => `Не показано, бо не увійшли в Steam: ${names}`,
  partnerSteamId: (id) => `Steam ID ${id}`,
  betweenYourAccounts: ' · між вашими акаунтами',
  checkSender: 'Перевірити відправника',
  nothing: 'Нічого',
  moreItems: (n) => `і ще ${n} ${items(n)}`,
  expiresIn: (left, waiting) =>
    `${waiting ? 'Чекає відповіді · ' : ''}спливає через ${left}`,
  arriveIn: (left) => `Прийнято, предмети надійдуть через ${left}`,
  hours: (n) => `${n} год`,
  days: (n) => `${n} ${days(n)}`,
  states: {
    active: 'Чекає відповіді',
    needsConfirmation: 'Чекає підтвердження в Guard',
    accepted: 'Прийнято',
    onHold: 'Прийнято, предмети на утриманні',
    countered: 'Зустрічна пропозиція',
    expired: 'Спливла',
    canceled: 'Скасовано',
    declined: 'Відхилено',
    invalidItems: 'Предметів більше немає',
    invalid: 'Недійсна',
  },
  warnings: {
    newAccount: (n) => `Акаунту ${n} ${days(n)}`,
    noLevel: 'Рівень Steam 0',
    vacBanned: 'VAC-бан',
    tradeBanned: 'Бан на обмін',
    tradeProbation: 'Випробувальний термін на обмін',
    privateProfile: 'Закритий профіль',
    copiesName: (of) => `Копіює ім’я ${of}`,
  },

  actions: {
    emailSent: 'Steam надіслав лист, щоб підтвердити трейд.',
    decline: 'Відхилити',
    accept: 'Прийняти',
    confirm: 'Підтвердити',
    cancel: 'Скасувати',
    confirmTitle: 'Прийняти трейд?',
    risky: (warnings) => `Відправник виглядає підозріло. ${warnings}`,
    itemsLeave: (account) =>
      `Guard одразу його підтвердить, і предмети підуть з ${account}.`,
  },

  partner: {
    title: 'Партнер з обміну',
    copiesName: (of) =>
      `Цей акаунт копіює ім’я ${of}, з яким ви торгуєте, але це інший акаунт Steam. Так працює шахрайство з підміною трейду: нічого йому не надсилайте.`,
    accountAge: 'Вік акаунта',
    hidden: 'Прихований',
    days: (n) => `${n} ${days(n)}`,
    level: 'Рівень Steam',
    unknown: 'Невідомо',
    tradesThisWeek: 'Трейдів з вами за тиждень',
    none: 'Немає',
    steamId: 'Steam ID',
    close: 'Закрити',
  },

  send: {
    title: 'Новий трейд',
    sentEmail:
      'Пропозицію надіслано. Steam надіслав лист із посиланням для підтвердження.',
    sentConfirmed: 'Пропозицію надіслано й підтверджено.',
    noAccount:
      'Жоден акаунт не увійшов у Steam. Спершу увійдіть на сторінці акаунта.',
    close: 'Закрити',
    from: 'З акаунта',
    game: 'Гра',
    tradeUrl: 'Трейд-посилання отримувача',
    selected: (n) => `Предмети · вибрано ${n}`,
    selectAll: 'Вибрати всі',
    clearSelection: 'Зняти вибір',
    findItem: 'Знайти предмет',
    tryAgain: 'Спробувати знову',
    loadingInventory: 'Завантажуємо інвентар…',
    nothingTradable: 'Зараз тут нічого обміняти.',
    noMatch: 'Нічого не знайдено.',
    held: (n) => `Ще ${n} ${items(n)} зараз не можна обміняти.`,
    message: 'Повідомлення',
    optional: 'Необов’язково',
    nothingAsked:
      'Натомість нічого не просимо. Guard підтверджує пропозицію одразу після надсилання.',
    sending: 'Надсилаємо…',
    sendItems: (n) => `Надіслати ${n} ${items(n)}`,
  },
}
