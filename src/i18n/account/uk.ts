import { plural } from '../plural.ts'
import type { account as en } from './en.ts'

const devices = (n: number) =>
  plural('uk', n, { one: 'пристрій', few: 'пристрої', other: 'пристроїв' })

export const account: typeof en = {
  back: '← Акаунти',
  importedFromMaFile: 'Імпортовано з .maFile',
  guardTitle: 'Steam Guard',
  copy: 'Копіювати',
  refresh: 'Оновити',
  refreshTitle: 'Знову завантажити зі Steam профіль, гаманець і дані безпеки',
  refreshesIn: (seconds) => `Оновиться за ${seconds} с`,
  sections: 'Розділи',
  tabs: {
    profile: 'Профіль',
    playing: 'Ігри',
    security: 'Безпека',
  },

  status: {
    playing: 'у грі',
    signedIn: 'вхід виконано',
    notSignedIn: 'немає входу',
  },

  security: {
    title: 'Безпека',
    steamSession: 'Сесія Steam',
    signedIn: 'Вхід виконано',
    notSignedIn: 'Вхід не виконано',
    check: 'Перевірити',
    checking: 'Перевіряємо…',
    signIn: 'Увійти',
    sessionAccepted: 'Steam прийняв сесію.',
    webApiKey: 'Ключ Web API',
    signInToCheck: 'Увійдіть, щоб перевірити',
    activeSessions: 'Активні сесії',
    show: 'Показати',
    hide: 'Сховати',
    devices: 'Пристрої',
    wallet: 'Гаманець',
    proxy: 'Проксі',
    noProxy: 'Без проксі',
    deletedProxy: 'Видалений проксі',
    group: 'Група',
    note: 'Нотатка',
    notePlaceholder: 'Бачите лише ви',
    noteSaved: 'Нотатку збережено',
    noGroup: 'Без групи',
    steamId: 'Steam ID',
    appearsAfterSignIn: 'З’явиться після входу',
    revocationCode: 'Код відновлення',
    notInMaFile: 'Немає в .maFile',
    deviceId: 'ID пристрою',
    proxyDeleted:
      'Проксі цього акаунта видалено. Акаунт не дістанеться до Steam, доки ви не виберете інший проксі або «Без проксі».',
    noOtherDevice: 'Інших пристроїв в акаунті не було.',
    signedOutDevices: (n) => `Вихід виконано на ${n} ${devices(n)}.`,
    signOutEverywhere: 'Вийти всюди',
    exportMaFile: 'Експорт .maFile',
    exportDetails: 'Експорт з даними',
    remove: 'Видалити з Lootify Guard',
    saved: (file) => `Збережено: ${file}`,
    unknown: 'Невідомо',
    none: 'Немає',
    yours: ' · ваш',
    onlyThisApp: 'Лише цей застосунок',
    thisAppAnd: (n) => `Цей застосунок і ще ${n} ${devices(n)}`,
    noWallet: 'Гаманця немає',
    pending: (balance, pending) => `${balance} · ${pending} в очікуванні`,
  },

  browser: {
    title: 'Браузер',
    signIns: 'Збережені входи',
    sites: (n) =>
      `${n} ${plural('uk', n, { one: 'сайт', few: 'сайти', other: 'сайтів' })}`,
    nothingSaved: 'Поки нічого',
    clear: 'Очистити',
    cleared: 'Входи очищено',
    hint: 'Вкладка акаунта зберігає входи на інші сайти, наприклад у його пошту, у зашифрованому сховищі. У Steam вона щоразу входить заново.',
  },

  autoConfirm: {
    ruleOn: (label) => `${label}: увімк.`,
    ruleOff: (label) => `${label}: вимк.`,
    title: 'Автопідтвердження',
    setForMany: 'Налаштувати для кількох акаунтів',
    notUntilSignedIn:
      'Нічого не підтверджується, доки акаунт не увійшов у Steam.',
    howOften:
      'Перевіряється щохвилини, поки сховище відкрите. API-ключі, зміна телефону та відновлення акаунта автоматично не підтверджуються ніколи.',
  },

  reveal: {
    title: 'Показати код відновлення',
    text: 'Цей код знімає Steam Guard з акаунта. Спершу підтвердьте, що це ви.',
    action: 'Показати',
  },

  exportFile: {
    title: 'Експорт .maFile',
    text: 'У файлі секрети Steam Guard цього акаунта у відкритому вигляді. Будь-хто, хто його отримає, зможе входити за його кодами й підтверджувати трейди. Зберігайте його там, куди маєте доступ лише ви.',
    action: 'Зберегти файл…',
  },

  exportDetails: {
    title: 'Експорт з даними',
    text: 'Збережеться тека з .maFile і account_details.json, де логін, пароль і код відновлення. Нічого в ній не зашифровано: будь-хто, хто її отримає, зможе входити, підтверджувати трейди й зняти Steam Guard. Зберігайте її там, куди маєте доступ лише ви.',
    action: 'Зберегти теку…',
  },

  confirmOwner: {
    masterPassword: 'Майстер-пароль',
    use: (name) => `Через ${name}`,
  },

  apiKey: {
    found: 'На акаунті знайдено ключ Web API',
    domain: (domain) =>
      `Домен ${domain}. Якщо це не ви, відкличте його, інакше ваші трейди можуть перехопити.`,
    mine: 'Це мій',
    revoke: 'Відкликати',
    revokeTitle: 'Відкликати API-ключ?',
    revokeText: (domain) =>
      `Ключ ${domain} буде видалено, і всі угоди через нього перестануть працювати. Якщо ви його не створювали, одразу змініть пароль Steam: той, хто його створив, був в акаунті.`,
    revoking: 'Відкликаємо…',
  },

  device: {
    thisApp: ' · цей застосунок',
    nameFor: (name) =>
      name ? `Назва для ${name}` : 'Назва для цього пристрою',
    name: 'Назва',
    rename: 'Перейменувати',
    signOut: 'Вийти',
    signingOut: 'Виходимо…',
    kinds: {
      steamClient: 'Клієнт Steam',
      browser: 'Браузер',
      mobileApp: 'Мобільний застосунок',
      unknown: 'Пристрій',
    },
  },

  signOut: {
    title: 'Вийти всюди?',
    nothingElse: 'Крім цього застосунку, в акаунт не увійшов жоден пристрій.',
    others:
      'Steam завершить усі сесії, крім цього застосунку. Ці пристрої попросять увійти знову:',
    signOut: 'Вийти всюди',
    signingOut: 'Виходимо…',
  },

  signIn: {
    title: 'Вхід у Steam',
    text: (accountName) =>
      `Lootify Guard увійде як ${accountName} і підтвердить вхід кодом Steam Guard цього акаунта. Пароль іде лише в Steam.`,
    password: 'Пароль Steam',
    savePassword: 'Зберегти пароль, а не лише сесію',
    savePasswordLabel: 'Зберегти пароль',
    wrongPassword: 'Steam каже, що пароль неправильний',
    signingIn: 'Входимо…',
    signIn: 'Увійти',
  },

  remove: {
    title: (accountName) => `Видалити ${accountName}?`,
    text: (withCode) =>
      `Акаунт видаляється лише з цього застосунку. Steam Guard у Steam залишається увімкненим, тож без ${withCode ? '.maFile або коду відновлення' : '.maFile'} ви втратите доступ до нього назавжди.`,
    backedUp: (withCode) =>
      withCode
        ? 'Я експортував .maFile або зберіг код відновлення'
        : 'Я експортував .maFile',
    remove: 'Видалити',
  },

  standing: {
    trading: 'Трейди й маркет',
    bans: 'VAC та ігрові бани',
    limited: 'Обмежений акаунт',
    unknown: 'Невідомо',
    signInToCheck: 'Увійдіть, щоб перевірити',
    tradeBanned: 'Трейд-бан',
    probation: 'Випробувальний строк для трейдів',
    available: 'Доступні',
    restrictedUntil: (date) => `Обмежені до ${date}`,
    restricted: 'Обмежені',
    noTradeBan: 'Трейд-бану немає',
    vacBanned: 'VAC-бан',
    noVacBan: 'VAC-бану немає',
    vacBans: (n) =>
      `${n} ${plural('uk', n, { one: 'VAC-бан', few: 'VAC-бани', other: 'VAC-банів' })}`,
    gameBans: (n) =>
      `${n} ${plural('uk', n, { one: 'ігровий бан', few: 'ігрові бани', other: 'ігрових банів' })}`,
    communityBan: 'бан у спільноті',
    none: 'Немає',
    daysAgo: (n) =>
      ` · ${n} ${plural('uk', n, { one: 'день', few: 'дні', other: 'днів' })} тому`,
    limitedYes: 'Так, доки в Steam не витрачено $5',
    limitedNo: 'Ні',
  },

  profile: {
    urlCopied: 'Трейд-посилання скопійовано',
    urlMade: 'Створено нове трейд-посилання',
    historyCleared: 'Історію нікнеймів очищено',
    avatarUpdated: 'Аватар оновлено',
    signInFirst: 'Увійдіть у Steam на вкладці «Безпека», щоб побачити профіль.',
    loading: 'Завантажуємо профіль…',
    saved: 'Профіль оновлено в Steam',
    nickname: 'Нікнейм',
    url: 'Посилання на профіль',
    notSet: 'Не задано',
    summary: 'Про себе',
    privacy: {
      profile: 'Профіль',
      inventory: 'Інвентар',
      games: 'Ігри',
    },
    visibility: {
      public: 'Усім',
      friendsOnly: 'Лише друзям',
      private: 'Приховано',
    },
    pastNames: 'Попередні нікнейми',
    clearHistory: 'Очистити історію нікнеймів',
    saving: 'Зберігаємо…',
    clearTitle: 'Очистити історію нікнеймів?',
    clearText:
      'Steam видалить список попередніх нікнеймів, який інші бачать у профілі. Цього не скасувати.',
    clear: 'Очистити',
    tradeUrl: 'Трейд-посилання',
    loadingUrl: 'Завантаження…',
    refresh: 'Оновити',
    tradeUrlHint:
      'Будь-хто, у кого є це посилання, може надсилати акаунту пропозиції обміну.',
    newTradeUrl: 'Нове трейд-посилання',
    newTradeUrlText:
      'Старе посилання перестане працювати, і пропозиції за ним не дійдуть. Оновіть його на Lootify та у своїх партнерів.',
    uploading: 'Завантажуємо…',
    changeAvatar: 'Змінити аватар',
    avatarHint: 'JPG, PNG або GIF, до 1 МБ.',
  },

  playing: {
    applied: 'Ігри оновлено',
    label: 'Ігри',
    signInFirst: 'Увійдіть у Steam на вкладці «Безпека», щоб запускати ігри.',
    applyChanges: 'Застосувати зміни',
    start: 'Запустити',
    stop: 'Зупинити',
    cardFarming: 'Фарм карток',
    farmCards: 'Фармити картки',
    games: (count, room) => `Ігри · ${count} з ${room}`,
    statusTakesPlace: ' (статус займає одне місце)',
    app: (id) => `Застосунок ${id}`,
    remove: (name) => `Прибрати ${name}`,
    addGame: '+ Гра',
    status: 'Свій статус (видно в профілі замість гри)',
    statusPlaceholder: 'Торгую на Lootify Market',
    presence: 'Статус у мережі',
    presences: {
      online: 'У мережі',
      away: 'Відійшов',
      busy: 'Не турбувати',
      invisible: 'Невидимий',
    },
    hint: 'Steam зараховує години лише в іграх, які є на акаунті. Якщо хтось грає на іншому пристрої, гра тут стає на паузу, доки він не закінчить.',
    notPlaying: 'Не грає',
    startHint: 'Запустіть, щоб ігри з’явилися в профілі',
    stopped: 'Гру зупинено',
    connecting: 'Підключаємося…',
    connectingText: 'Входимо в Steam як клієнт',
    nowPlaying: 'Зараз грає',
    paused: 'Пауза',
    pausedText:
      'Хтось грає на іншому пристрої; години підуть далі, коли він закінчить',
    reconnecting: 'Перепідключаємося',
    tryingAgain: (reason, seconds) => `${reason}. Нова спроба за ${seconds} с`,
    elapsedHours: (hours, minutes) => `${hours} год ${minutes} хв`,
    elapsedMinutes: (minutes, seconds) => `${minutes} хв ${seconds} с`,
    farmIdle:
      'Запускає ігри, у яких ще випадають картки, доки вони не скінчаться',
    farmChecking: 'Читаємо значки…',
    farmDone: 'Карток більше не випаде',
    dropsLeft: (drops, games) =>
      `Залишилось ${drops} ${plural('uk', drops, { one: 'картка', few: 'картки', other: 'карток' })} у ${games} ${plural('uk', games, { one: 'грі', other: 'іграх' })}`,
    farmPlaying: (name) => `грає в ${name}`,
    buildingHours: (games) =>
      `набирає години в ${games} ${plural('uk', games, { one: 'грі', other: 'іграх' })}`,
    nextCheck: (minutes) => `наступна перевірка за ${minutes} хв`,
  },

  picker: {
    title: 'Додати ігри',
    picked: (count, room) => `Вибрано · ${count} з ${room}`,
    find: 'Знайти гру',
    findPlaceholder: 'Назва або app ID',
    loading: 'Завантажуємо ігри акаунта…',
    noGames: 'Steam не показує ігор, або відомості про ігри акаунта приховані.',
    app: (id) => `Застосунок ${id}`,
    hours: (hours) => `${hours} год`,
    done: 'Готово',
  },
}
