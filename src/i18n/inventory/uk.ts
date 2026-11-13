import { plural } from '../plural.ts'
import type { inventory as en } from './en.ts'

const items = (n: number) =>
  `${n} ${plural('uk', n, { one: 'предмет', few: 'предмети', many: 'предметів', other: 'предмета' })}`

const accounts = (n: number) =>
  `${n} ${plural('uk', n, { one: 'акаунта', other: 'акаунтів' })}`

export const inventory: typeof en = {
  title: 'Інвентар',
  shownItems: 'Предметів',
  subtitle: 'Усі предмети всіх акаунтів в одному місці.',
  items,
  account: 'Акаунт',
  allAccounts: 'Усі акаунти',
  group: 'Група',
  game: 'Гра',
  search: 'Пошук предметів',
  sort: 'Сортування',
  sorts: {
    rarity: 'За рідкістю, спершу рідкісні',
    name: 'За назвою, А–Я',
    account: 'За акаунтом',
  },
  tradableOnly: 'Лише ті, що можна обміняти',
  selected: (n) => `Вибрано: ${n}`,
  clearSelection: 'Зняти вибір',
  clickToSelect: 'Натисніть на предмети, щоб вибрати їх',
  selectAll: 'Вибрати всі',
  loadingMore: (n) =>
    `Завантажуємо ще ${n} ${plural('uk', n, { one: 'акаунт', few: 'акаунти', many: 'акаунтів', other: 'акаунта' })}…`,
  moveToOne: 'Перенести на один акаунт',
  steamMarket: 'Торговий майданчик Steam',
  notTradable: 'Зараз не можна обміняти',
  noneSignedIn: 'Жоден акаунт не увійшов у Steam.',
  noItems: (game) => `На цих акаунтах немає предметів ${game}.`,
  nothingFound: 'Нічого не знайдено.',

  card: {
    pieces: (n) => `${n} шт.`,
  },

  move: {
    title: 'Перенесення на один акаунт',
    moveTo: 'Куди перенести',
    pickedHere: (n) => `вибрано ${items(n)} тут`,
    moved: 'Перенесено',
    sentWaiting: (target, reason) =>
      `Надіслано, але ${target} поки не зміг прийняти обмін. Він чекає на екрані «Трейди». (${reason})`,
    done: 'Готово',
    allThere: (target) => `Усе вибране вже на ${target}.`,
    plan: (count, from, target) =>
      `${items(count)} з ${accounts(from)} ${plural('uk', count, { one: 'піде', other: 'підуть' })} на ${target}. Кожен акаунт надішле обмін, Guard його підтвердить, а ${target} прийме, тож телефон не знадобиться.`,
    staying: (n) =>
      ` ${items(n)} уже ${plural('uk', n, { one: 'лежить', other: 'лежать' })} там і ${plural('uk', n, { one: 'залишиться', other: 'залишаться' })}.`,
    moving: 'Переносимо…',
    movedTo: (count, target) => `Перенесено на ${target}: ${items(count)}`,
    move: (n) => `Перенести ${items(n)}`,
  },

  market: {
    title: 'Виставити на торговий майданчик Steam',
    intro:
      'Вкажіть, скільки платить покупець. Steam бере 5%, гра 10%, а Guard одразу підтверджує лоти.',
    skipped: (n) =>
      ` ${items(n)} з вибраних зараз не можна виставити, ${plural('uk', n, { one: 'його пропущено', other: 'їх пропущено' })}.`,
    noPrices: (reason) => `Не вдалося дізнатися ціни: ${reason}`,
    asking: 'Дізнаємося ціни…',
    lowest: (price) => `Від ${price}`,
    median: (price) => `медіана ${price}`,
    noPrice: 'Ціни на майданчику немає',
    buyerPays: (name) => `Покупець платить за ${name}`,
    youGet: (money) => `ви отримаєте ${money}`,
    youGetTotal: (money) => `Загалом ви отримаєте близько ${money}`,
    listing: 'Виставляємо…',
    listedToast: (count) => `Виставлено: ${items(count)}`,
    list: (n) => `Виставити ${items(n)}`,
    listed: 'Виставлено',
    unconfirmed: 'Виставлено, але чекає підтвердження на екрані Steam Guard',
    needsEmail: 'Виставлено, чекає підтвердження з листа Steam',
    done: 'Готово',
  },
}
