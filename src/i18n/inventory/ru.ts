import { plural } from '../plural.ts'
import type { inventory as en } from './en.ts'

const items = (n: number) =>
  `${n} ${plural('ru', n, { one: 'предмет', few: 'предмета', many: 'предметов', other: 'предмета' })}`

const accounts = (n: number) =>
  `${n} ${plural('ru', n, { one: 'аккаунта', other: 'аккаунтов' })}`

export const inventory: typeof en = {
  title: 'Инвентарь',
  subtitle: 'Все предметы всех аккаунтов в одном месте.',
  items,
  account: 'Аккаунт',
  allAccounts: 'Все аккаунты',
  group: 'Группа',
  game: 'Игра',
  search: 'Поиск предметов',
  sort: 'Сортировка',
  sorts: {
    rarity: 'По редкости, сначала редкие',
    name: 'По названию, А–Я',
    account: 'По аккаунту',
  },
  tradableOnly: 'Только обмениваемые',
  selected: (n) => `Выбрано: ${n}`,
  clearSelection: 'Снять выбор',
  clickToSelect: 'Нажмите на предметы, чтобы выбрать их',
  selectAll: 'Выбрать все',
  loadingMore: (n) =>
    `Загружаем ещё ${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', many: 'аккаунтов', other: 'аккаунта' })}…`,
  moveToOne: 'Перенести на один аккаунт',
  steamMarket: 'Торговая площадка Steam',
  notTradable: 'Сейчас нельзя обменять',
  noneSignedIn: 'Ни один аккаунт не вошёл в Steam.',
  noItems: (game) => `На этих аккаунтах нет предметов ${game}.`,
  nothingFound: 'Ничего не найдено.',

  card: {
    pieces: (n) => `${n} шт.`,
  },

  move: {
    title: 'Перенос на один аккаунт',
    moveTo: 'Куда перенести',
    pickedHere: (n) =>
      `${plural('ru', n, { one: 'выбран', other: 'выбрано' })} ${items(n)} здесь`,
    moved: 'Перенесено',
    sentWaiting: (target, reason) =>
      `Отправлено, но ${target} пока не смог принять обмен. Он ждёт на экране «Трейды». (${reason})`,
    done: 'Готово',
    allThere: (target) => `Всё выбранное уже на ${target}.`,
    plan: (count, from, target) =>
      `${items(count)} с ${accounts(from)} ${plural('ru', count, { one: 'уйдёт', other: 'уйдут' })} на ${target}. Каждый аккаунт отправит обмен, Guard его подтвердит, а ${target} примет, так что телефон не понадобится.`,
    staying: (n) =>
      ` ${items(n)} уже ${plural('ru', n, { one: 'лежит', other: 'лежат' })} там и ${plural('ru', n, { one: 'останется', other: 'останутся' })}.`,
    moving: 'Переносим…',
    move: (n) => `Перенести ${items(n)}`,
  },

  market: {
    title: 'Выставить на торговую площадку Steam',
    intro:
      'Укажите, сколько платит покупатель. Steam берёт 5%, игра 10%, а Guard сразу подтверждает лоты.',
    skipped: (n) =>
      ` ${items(n)} из выбранных сейчас нельзя выставить, ${plural('ru', n, { one: 'он пропущен', other: 'они пропущены' })}.`,
    noPrices: (reason) => `Не удалось узнать цены: ${reason}`,
    asking: 'Узнаём цены…',
    lowest: (price) => `От ${price}`,
    median: (price) => `медиана ${price}`,
    noPrice: 'Цены на площадке нет',
    buyerPays: (name) => `Покупатель платит за ${name}`,
    youGet: (money) => `вы получите ${money}`,
    youGetTotal: (money) => `Всего вы получите около ${money}`,
    listing: 'Выставляем…',
    list: (n) => `Выставить ${items(n)}`,
    listed: 'Выставлено',
    unconfirmed: 'Выставлено, но ждёт подтверждения на экране Steam Guard',
    needsEmail: 'Выставлено, ждёт подтверждения из письма Steam',
    done: 'Готово',
  },
}
