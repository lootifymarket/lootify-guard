import { plural } from '../plural.ts'
import type { tasks as en } from './en.ts'

export const tasks: typeof en = {
  title: 'Задачи',
  subtitle: 'Выберите задачу, а потом аккаунты для неё',
  allAccounts: 'Все аккаунты',
  noGroup: 'Без группы',
  kinds: {
    hourBoost: {
      name: 'Буст часов',
      text: 'Запускает игры на соединении, которое держится постоянно',
    },
    cardFarming: {
      name: 'Фарм карточек',
      text: 'Запускает игры, в которых ещё выпадают карточки, пока они не закончатся',
    },
    moveToStorage: {
      name: 'Перенос на склад',
      text: 'Все передаваемые предметы на один аккаунт',
    },
    acceptGifts: {
      name: 'Принять подарки',
      text: 'Входящие обмены, в которых аккаунт ничего не отдаёт',
    },
    profile: {
      name: 'Профиль',
      text: 'Никнейм, описание, аватар и приватность',
    },
    freeGames: {
      name: 'Бесплатные игры',
      text: 'Бесплатные лицензии по ссылке из магазина или ID',
    },
    events: {
      name: 'События',
      text: 'Очередь открытий и бесплатный предмет распродажи',
    },
    check: {
      name: 'Проверка',
      text: 'Сессия, профиль, ключ Web API, баны и ограничения',
    },
    goOffline: {
      name: 'Уйти в офлайн',
      text: 'Остановить игры и закрыть игровое соединение',
    },
  },
  moveTo: (storage) => `Перенос на ${storage}`,

  imageTooBig: 'Изображение больше 1 МБ',

  to: 'Куда',
  pickAccount: 'Выберите аккаунт',
  game: 'Игра',
  moveNote:
    'Каждый аккаунт отправляет обмен со всеми передаваемыми предметами, а склад его принимает. Телефон не нужен.',

  games: 'Игры',
  ownList: 'Собственный список каждого аккаунта',
  boostNote:
    'ID приложений или ссылки из магазина, до 32. Если оставить пустым, каждый аккаунт запускает игры со своей вкладки «Игры». Аккаунты играют до задачи «Уйти в офлайн» и сами переподключаются.',

  discoveryQueues: 'Очереди открытий',
  queues: (n) =>
    n === 0
      ? 'Нет'
      : `${n} ${plural('ru', n, { one: 'очередь', few: 'очереди', other: 'очередей' })}`,
  claimItem: 'Забрать бесплатный предмет распродажи',
  eventsNote:
    'Во время распродаж и фестивалей Steam просмотр очереди даёт карточки, а бесплатный предмет — это стикер или что-то похожее. Когда распродажи нет, получать нечего.',

  freeGamesNote:
    'Ссылки из магазина, ID вида app/… или sub/… через пробел или запятую. Просто число — это ID приложения. Уже купленные игры пропускаются.',

  onlyOwn: 'Только от моих аккаунтов',

  atOnce: 'Одновременно',
  oneByOne: 'По одному',
  accountsAtOnce: (n) =>
    `${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}`,
  pause: 'Пауза между аккаунтами',
  noPause: 'Нет',
  seconds: (min, max) => `${min}–${max} с`,
  retry: 'Повторять неудачные, до 3 раз',
  retryLabel: 'Повторять неудачные аккаунты',
  runOn: (target, n) => `Запустить: ${target} (${n})`,
  sections: {
    playing: 'Игры',
    profile: 'Профиль и активность',
    items: 'Предметы и трейды',
    store: 'Магазин и события',
    checks: 'Проверки',
  },
  running: 'Идёт',
  accounts: 'Аккаунты',
  pickAccounts: 'Выбрать аккаунты…',
  pickedAccounts: 'Выбранные аккаунты',
  accountCount: (n: number) =>
    `${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}`,
  selected: (n: number, total: number) => `Выбрано ${n} из ${total}`,
  search: 'Поиск аккаунтов',
  pickAll: 'Все',
  pickNone: 'Никого',
  noMatches: 'Ничего не нашлось.',
  runOnPicked: (n: number) =>
    `Запустить: ${n} ${plural('ru', n, { one: 'аккаунт', few: 'аккаунта', other: 'аккаунтов' })}`,
  started: (task, target) => `Задача «${task}» запущена: ${target}`,

  profile: {
    nickname: 'Никнейм',
    random: 'Случайный',
    randomHint: 'Свой случайный никнейм для каждого аккаунта',
    keepAsIs: 'Оставить как есть',
    templateNote:
      '{n} заменяется номером аккаунта в группе: из farm {n} получится farm 1, farm 2… {random} даёт каждому аккаунту свой случайный никнейм.',
    privacy: {
      profile: 'Профиль',
      inventory: 'Инвентарь',
      games: 'Игры',
    },
    keep: 'Не менять',
    avatarKeep: 'Аватар: не менять',
    remove: 'Убрать',
    chooseImage: 'Выбрать изображение',
    description: 'Описание',
    descriptionModes: {
      keep: 'Не менять',
      generate: 'Сгенерировать',
      lines: 'Из моих строк',
    },
    piecesLabel: 'Части',
    pieces: {
      greeting: 'Приветствие',
      about: 'О себе',
      games: 'Игры',
      status: 'Статус',
      quote: 'Цитата',
      tradeNote: 'Про трейды',
      ascii: 'ASCII-арт',
      kaomoji: 'Каомодзи',
      divider: 'Разделители',
    },
    language: 'Язык',
    languages: {
      mixed: 'Английский и русский',
      english: 'Английский',
      russian: 'Русский',
    },
    length: 'Длина',
    lengths: {
      short: 'Короткое, 1–2 части',
      medium: 'Среднее, 3–4 части',
      long: 'Длинное, 5–7 частей',
    },
    examples: 'Примеры',
    shuffle: 'Перемешать',
    generateNote:
      'Каждый аккаунт получает свой текст: части идут в случайном порядке, и у каждой свои варианты. Двух одинаковых в одной задаче не будет.',
    myLines: 'Мои строки',
    linesPlaceholder: '{hey|yo}, just a {CS2|Rust} player from {country}',
    linesNote:
      'Одно описание на строку. {a|b|c} выбирает один из вариантов, {country} — случайную страну, {n} — номер аккаунта. Каждый аккаунт получает случайную строку.',
  },

  queue: {
    title: 'Очередь',
    clearFinished: 'Убрать завершённые',
    empty: 'Пока ничего не запускалось.',
    running: 'Выполняется',
    stopped: 'Остановлена',
    done: 'Готово',
    toLookAt: (n) =>
      `${n} ${plural('ru', n, { one: 'требует', few: 'требуют', other: 'требуют' })} внимания`,
    error: 'Ошибка',
    of: (done, total) => `${done} из ${total}`,
    stoppedToast: 'Задача остановлена',
    close: 'Закрыть',
    ok: 'OK',
    stop: 'Остановить',
    waitingRetry: (tries) => `Ждёт повтора (${tries} из 3)`,
    waiting: 'Ждёт',
    runningAccount: 'Выполняется…',
    skipped: 'Пропущен',
  },
}
