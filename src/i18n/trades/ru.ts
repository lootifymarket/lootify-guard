import { plural } from '../plural.ts'
import type { trades as en } from './en.ts'

const items = (n: number) =>
  plural('ru', n, { one: 'предмет', few: 'предмета', other: 'предметов' })
const days = (n: number) =>
  plural('ru', n, { one: 'день', few: 'дня', other: 'дней' })

export const trades: typeof en = {
  title: 'Трейды',
  subtitle: 'Предложения обмена со всех ваших аккаунтов в одном списке',
  loading: 'Загружаем…',
  reload: 'Обновить',
  newTrade: 'Новый трейд',
  offersLabel: 'Предложения',
  tabs: {
    incoming: 'Входящие',
    outgoing: 'Исходящие',
    history: 'История',
  },
  empty: {
    incoming: 'Нет предложений, которые ждут вас.',
    outgoing: 'Нет предложений, которые ждут других.',
    history: 'За неделю ни одно предложение не завершилось.',
  },
  columns: {
    parties: 'От кого → кому',
    give: 'Вы отдаёте',
    get: 'Вы получаете',
  },
  askingSteam: 'Спрашиваем Steam…',
  notShown: (names) => `Не показаны, потому что не вошли в Steam: ${names}`,
  partnerSteamId: (id) => `Steam ID ${id}`,
  betweenYourAccounts: ' · между вашими аккаунтами',
  checkSender: 'Проверить отправителя',
  nothing: 'Ничего',
  moreItems: (n) => `и ещё ${n} ${items(n)}`,
  expiresIn: (left, waiting) =>
    `${waiting ? 'Ждёт ответа · ' : ''}истекает через ${left}`,
  arriveIn: (left) => `Принято, предметы придут через ${left}`,
  hours: (n) => `${n} ч`,
  days: (n) => `${n} ${days(n)}`,
  states: {
    active: 'Ждёт ответа',
    needsConfirmation: 'Ждёт подтверждения в Guard',
    accepted: 'Принято',
    onHold: 'Принято, предметы на удержании',
    countered: 'Встречное предложение',
    expired: 'Истекло',
    canceled: 'Отменено',
    declined: 'Отклонено',
    invalidItems: 'Предметов больше нет',
    invalid: 'Недействительно',
  },
  warnings: {
    newAccount: (n) => `Аккаунту ${n} ${days(n)}`,
    noLevel: 'Уровень Steam 0',
    vacBanned: 'VAC-бан',
    tradeBanned: 'Бан на обмен',
    tradeProbation: 'Испытательный срок на обмен',
    privateProfile: 'Закрытый профиль',
    copiesName: (of) => `Копирует имя ${of}`,
  },

  actions: {
    emailSent: 'Steam отправил письмо, чтобы подтвердить трейд.',
    decline: 'Отклонить',
    accept: 'Принять',
    confirm: 'Подтвердить',
    cancel: 'Отменить',
    confirmTitle: 'Принять трейд?',
    risky: (warnings) => `Отправитель выглядит подозрительно. ${warnings}`,
    itemsLeave: (account) =>
      `Guard сразу его подтвердит, и предметы уйдут с ${account}.`,
  },

  partner: {
    title: 'Партнёр по обмену',
    copiesName: (of) =>
      `Этот аккаунт копирует имя ${of}, с которым вы торгуете, но это другой аккаунт Steam. Так работает мошенничество с подменой трейда: ничего ему не отправляйте.`,
    accountAge: 'Возраст аккаунта',
    hidden: 'Скрыт',
    days: (n) => `${n} ${days(n)}`,
    level: 'Уровень Steam',
    unknown: 'Неизвестно',
    tradesThisWeek: 'Трейдов с вами за неделю',
    none: 'Нет',
    steamId: 'Steam ID',
    close: 'Закрыть',
  },

  send: {
    title: 'Новый трейд',
    sentEmail:
      'Предложение отправлено. Steam прислал письмо со ссылкой для подтверждения.',
    sentConfirmed: 'Предложение отправлено и подтверждено.',
    noAccount:
      'Ни один аккаунт не вошёл в Steam. Сначала войдите на странице аккаунта.',
    close: 'Закрыть',
    from: 'С аккаунта',
    game: 'Игра',
    tradeUrl: 'Трейд-ссылка получателя',
    selected: (n) => `Предметы · выбрано ${n}`,
    selectAll: 'Выбрать все',
    clearSelection: 'Снять выбор',
    findItem: 'Найти предмет',
    tryAgain: 'Попробовать снова',
    loadingInventory: 'Загружаем инвентарь…',
    nothingTradable: 'Сейчас здесь нечего обменять.',
    noMatch: 'Ничего не найдено.',
    held: (n) => `Ещё ${n} ${items(n)} сейчас нельзя обменять.`,
    message: 'Сообщение',
    optional: 'Необязательно',
    nothingAsked:
      'Взамен ничего не просим. Guard подтверждает предложение сразу после отправки.',
    sending: 'Отправляем…',
    sendItems: (n) => `Отправить ${n} ${items(n)}`,
  },
}
