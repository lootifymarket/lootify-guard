import { plural } from '../plural.ts'
import type { account as en } from './en.ts'

const devices = (n: number) =>
  plural('ru', n, { one: 'устройство', few: 'устройства', other: 'устройств' })

export const account: typeof en = {
  back: '← Аккаунты',
  importedFromMaFile: 'Импортирован из .maFile',
  guardTitle: 'Steam Guard',
  copy: 'Копировать',
  refresh: 'Обновить',
  refreshTitle:
    'Заново загрузить из Steam профиль, кошелёк и данные безопасности',
  refreshesIn: (seconds) => `Обновится через ${seconds} с`,
  sections: 'Разделы',
  tabs: {
    profile: 'Профиль',
    playing: 'Игры',
    security: 'Безопасность',
  },

  status: {
    playing: 'в игре',
    signedIn: 'вход выполнен',
    notSignedIn: 'нет входа',
  },

  security: {
    title: 'Безопасность',
    steamSession: 'Сессия Steam',
    signedIn: 'Вход выполнен',
    notSignedIn: 'Вход не выполнен',
    check: 'Проверить',
    checking: 'Проверяем…',
    signIn: 'Войти',
    sessionAccepted: 'Steam принял сессию.',
    webApiKey: 'Ключ Web API',
    signInToCheck: 'Войдите, чтобы проверить',
    activeSessions: 'Активные сессии',
    show: 'Показать',
    hide: 'Скрыть',
    devices: 'Устройства',
    wallet: 'Кошелёк',
    proxy: 'Прокси',
    noProxy: 'Без прокси',
    deletedProxy: 'Удалённый прокси',
    group: 'Группы',
    note: 'Заметка',
    notePlaceholder: 'Видна только вам',
    noteSaved: 'Заметка сохранена',
    noGroup: 'Без группы',
    steamId: 'Steam ID',
    appearsAfterSignIn: 'Появится после входа',
    revocationCode: 'Код восстановления',
    notInMaFile: 'Нет в .maFile',
    deviceId: 'ID устройства',
    proxyDeleted:
      'Прокси этого аккаунта удалён. Аккаунт не достучится до Steam, пока вы не выберете другой прокси или «Без прокси».',
    noOtherDevice: 'Других устройств в аккаунте не было.',
    signedOutDevices: (n) => `Выход выполнен на ${n} ${devices(n)}.`,
    signOutEverywhere: 'Выйти везде',
    replaceGuard: 'Заменить Steam Guard',
    exportMaFile: 'Экспорт .maFile',
    exportDetails: 'Экспорт с данными',
    remove: 'Удалить из Lootify Guard',
    saved: (file) => `Сохранено: ${file}`,
    unknown: 'Неизвестно',
    none: 'Нет',
    yours: ' · ваш',
    onlyThisApp: 'Только это приложение',
    thisAppAnd: (n) => `Это приложение и ещё ${n} ${devices(n)}`,
    noWallet: 'Кошелька нет',
    pending: (balance, pending) => `${balance} · ${pending} в ожидании`,
  },

  browser: {
    title: 'Браузер',
    signIns: 'Сохранённые входы',
    sites: (n) =>
      `${n} ${plural('ru', n, { one: 'сайт', few: 'сайта', other: 'сайтов' })}`,
    nothingSaved: 'Пока ничего',
    clear: 'Очистить',
    cleared: 'Входы очищены',
    hint: 'Вкладка аккаунта хранит входы на другие сайты, например в его почту, в зашифрованном хранилище. В Steam она каждый раз входит заново.',
  },

  autoConfirm: {
    ruleOn: (label) => `${label}: вкл.`,
    ruleOff: (label) => `${label}: выкл.`,
    title: 'Автоподтверждение',
    setForMany: 'Настроить для нескольких аккаунтов',
    notUntilSignedIn:
      'Ничего не подтверждается, пока аккаунт не вошёл в Steam.',
    howOften:
      'Проверяется каждую минуту, пока хранилище открыто. API-ключи, смена телефона и восстановление аккаунта автоматически не подтверждаются никогда.',
  },

  reveal: {
    title: 'Показать код восстановления',
    text: 'Этот код снимает Steam Guard с аккаунта. Сначала подтвердите, что это вы.',
    action: 'Показать',
  },

  exportFile: {
    title: 'Экспорт .maFile',
    text: 'В файле секреты Steam Guard этого аккаунта в открытом виде. Любой, кто его получит, сможет входить по его кодам и подтверждать трейды. Храните его там, куда есть доступ только у вас.',
    action: 'Сохранить файл…',
  },

  exportDetails: {
    title: 'Экспорт с данными',
    text: 'Сохранится папка с .maFile и account_details.json, где логин, пароль и код восстановления. Ничего в ней не зашифровано: любой, кто её получит, сможет входить, подтверждать трейды и снять Steam Guard. Храните её там, куда есть доступ только у вас.',
    action: 'Сохранить папку…',
  },

  confirmOwner: {
    masterPassword: 'Мастер-пароль',
    use: (name) => `Через ${name}`,
  },

  apiKey: {
    found: 'На аккаунте найден ключ Web API',
    domain: (domain) =>
      `Домен ${domain}. Если это не вы, отзовите его, иначе ваши трейды могут перехватить.`,
    mine: 'Это мой',
    revoke: 'Отозвать',
    revokeTitle: 'Отозвать API-ключ?',
    revokeText: (domain) =>
      `Ключ ${domain} будет удалён, и все сделки через него перестанут работать. Если вы его не создавали, сразу смените пароль Steam: тот, кто его создал, был в аккаунте.`,
    revoking: 'Отзываем…',
  },

  device: {
    thisApp: ' · это приложение',
    nameFor: (name) =>
      name ? `Название для ${name}` : 'Название для этого устройства',
    name: 'Название',
    rename: 'Переименовать',
    signOut: 'Выйти',
    signingOut: 'Выходим…',
    kinds: {
      steamClient: 'Клиент Steam',
      browser: 'Браузер',
      mobileApp: 'Мобильное приложение',
      unknown: 'Устройство',
    },
  },

  signOut: {
    title: 'Выйти везде?',
    nothingElse:
      'Кроме этого приложения, в аккаунт не вошло ни одно устройство.',
    others:
      'Steam завершит все сессии, кроме этого приложения. Эти устройства попросят войти снова:',
    signOut: 'Выйти везде',
    signingOut: 'Выходим…',
  },
  replaceGuard: {
    title: 'Заменить Steam Guard',
    confirmText:
      'Steam сделает новые секреты Guard для этого аккаунта. Все другие копии — .maFile, SDA или телефон — перестанут давать рабочие коды. Сначала подтвердите, что это вы.',
    continue: 'Продолжить',
    methods:
      'Steam подтвердит через SMS на телефон аккаунта. Если телефона нет, используйте код восстановления: он снимет старый Guard, а новый Steam подтвердит по почте.',
    smsOnly: 'Steam подтвердит через SMS на телефон аккаунта.',
    tradeHold: 'После этого Steam на время задержит трейды и лоты на маркете.',
    sendSms: 'Отправить SMS',
    useRevocationCode: 'Код восстановления',
    askingSteam: 'Спрашиваем Steam…',
    smsText: (phone) =>
      `Steam отправил SMS на ${phone}. Как только вы его введёте, старый Steam Guard перестанет работать везде.`,
    emailText:
      'Steam отправил код на почту аккаунта. Введите его, чтобы включить новый Steam Guard.',
    phoneEnding: (digits) => `номер, который заканчивается на ${digits}`,
    accountPhone: 'номер телефона аккаунта',
    guardIsOff:
      'Старый Steam Guard уже снят. Закончите здесь, иначе аккаунт останется без него.',
    code: 'Код',
    checking: 'Проверяем…',
    confirm: 'Подтвердить',
    replaced:
      'Новый Steam Guard включён. Коды из старых копий больше не работают.',
    newRevocationCode:
      'Новый код восстановления. Старый больше не работает. Сохраните копию не на этом компьютере.',
    noRevocationCode: 'Steam не выдал новый код восстановления.',
    copyCode: 'Скопировать код',
    signOutHint:
      'У того, у кого была старая копия, может остаться вход. Выйдите на всех других устройствах и смените пароль.',
    signOutEverywhere: 'Выйти везде',
    done: 'Готово',
  },

  signIn: {
    title: 'Вход в Steam',
    text: (accountName) =>
      `Lootify Guard войдёт как ${accountName} и подтвердит вход кодом Steam Guard этого аккаунта. Пароль уходит только в Steam.`,
    password: 'Пароль Steam',
    savePassword: 'Сохранить пароль, а не только сессию',
    savePasswordLabel: 'Сохранить пароль',
    wrongPassword: 'Steam говорит, что пароль неверный',
    signingIn: 'Входим…',
    signIn: 'Войти',
  },

  remove: {
    title: (accountName) => `Удалить ${accountName}?`,
    text: (withCode) =>
      `Аккаунт удаляется только из этого приложения. Steam Guard в Steam остаётся включённым, поэтому без ${withCode ? '.maFile или кода восстановления' : '.maFile'} вы потеряете доступ к нему навсегда.`,
    backedUp: (withCode) =>
      withCode
        ? 'Я экспортировал .maFile или сохранил код восстановления'
        : 'Я экспортировал .maFile',
    remove: 'Удалить',
  },

  standing: {
    trading: 'Трейды и маркет',
    bans: 'VAC и игровые баны',
    limited: 'Ограниченный аккаунт',
    unknown: 'Неизвестно',
    signInToCheck: 'Войдите, чтобы проверить',
    tradeBanned: 'Трейд-бан',
    probation: 'Испытательный срок по трейдам',
    available: 'Доступны',
    restrictedUntil: (date) => `Ограничены до ${date}`,
    restricted: 'Ограничены',
    noTradeBan: 'Трейд-бана нет',
    vacBanned: 'VAC-бан',
    noVacBan: 'VAC-бана нет',
    vacBans: (n) =>
      `${n} ${plural('ru', n, { one: 'VAC-бан', few: 'VAC-бана', other: 'VAC-банов' })}`,
    gameBans: (n) =>
      `${n} ${plural('ru', n, { one: 'игровой бан', few: 'игровых бана', other: 'игровых банов' })}`,
    communityBan: 'бан в сообществе',
    none: 'Нет',
    daysAgo: (n) =>
      ` · ${n} ${plural('ru', n, { one: 'день', few: 'дня', other: 'дней' })} назад`,
    limitedYes: 'Да, пока в Steam не потрачено $5',
    limitedNo: 'Нет',
  },

  profile: {
    urlCopied: 'Трейд-ссылка скопирована',
    urlMade: 'Создана новая трейд-ссылка',
    historyCleared: 'История никнеймов очищена',
    avatarUpdated: 'Аватар обновлён',
    signInFirst:
      'Войдите в Steam на вкладке «Безопасность», чтобы увидеть профиль.',
    loading: 'Загружаем профиль…',
    saved: 'Профиль обновлён в Steam',
    nickname: 'Никнейм',
    randomNickname: 'Случайный никнейм',
    url: 'Ссылка на профиль',
    notSet: 'Не задана',
    summary: 'О себе',
    privacy: {
      profile: 'Профиль',
      inventory: 'Инвентарь',
      games: 'Игры',
    },
    visibility: {
      public: 'Всем',
      friendsOnly: 'Только друзьям',
      private: 'Скрыт',
    },
    pastNames: 'Прошлые никнеймы',
    clearHistory: 'Очистить историю никнеймов',
    saving: 'Сохраняем…',
    clearTitle: 'Очистить историю никнеймов?',
    clearText:
      'Steam удалит список прошлых никнеймов, который другие видят в профиле. Это нельзя отменить.',
    clear: 'Очистить',
    tradeUrl: 'Трейд-ссылка',
    loadingUrl: 'Загрузка…',
    refresh: 'Обновить',
    tradeUrlHint:
      'Любой, у кого есть эта ссылка, может отправлять аккаунту предложения обмена.',
    newTradeUrl: 'Новая трейд-ссылка',
    newTradeUrlText:
      'Старая ссылка перестанет работать, и предложения по ней не дойдут. Обновите её на Lootify и у своих партнёров.',
    uploading: 'Загружаем…',
    changeAvatar: 'Сменить аватар',
    avatarHint: 'JPG, PNG или GIF, до 1 МБ.',
  },

  playing: {
    freeNoAnswer: 'Steam не ответил на запрос добавить бесплатные игры.',
    freeRefused: (code) => `Steam не добавил бесплатные игры (ошибка ${code}).`,
    freeAdded: (games) => `Steam добавил: ${games}.`,
    freeNotAdded: (games) =>
      `Не добавлены — уже есть на аккаунте или Steam их не выдал: ${games}.`,
    applied: 'Игры обновлены',
    label: 'Игры',
    signInFirst:
      'Войдите в Steam на вкладке «Безопасность», чтобы запускать игры.',
    applyChanges: 'Применить изменения',
    start: 'Запустить',
    stop: 'Остановить',
    cardFarming: 'Фарм карточек',
    farmCards: 'Фармить карточки',
    games: (count, room) => `Игры · ${count} из ${room}`,
    statusTakesPlace: ' (статус занимает одно место)',
    app: (id) => `Приложение ${id}`,
    remove: (name) => `Убрать ${name}`,
    addGame: '+ Игра',
    status: 'Свой статус (виден в профиле вместо игры)',
    statusPlaceholder: 'Торгую на Lootify Market',
    presence: 'Статус в сети',
    presences: {
      online: 'В сети',
      away: 'Нет на месте',
      busy: 'Не беспокоить',
      invisible: 'Невидимка',
    },
    hint: 'Steam засчитывает часы только в играх, которые есть на аккаунте. Если кто-то играет на другом устройстве, игра здесь встаёт на паузу, пока он не закончит.',
    notPlaying: 'Не играет',
    startHint: 'Запустите, чтобы игры появились в профиле',
    stopped: 'Игра остановлена',
    connecting: 'Подключаемся…',
    connectingText: 'Входим в Steam как клиент',
    nowPlaying: 'Сейчас играет',
    paused: 'Пауза',
    pausedText:
      'Кто-то играет на другом устройстве; часы пойдут дальше, когда он закончит',
    reconnecting: 'Переподключаемся',
    tryingAgain: (reason, seconds) =>
      `${reason}. Новая попытка через ${seconds} с`,
    elapsedHours: (hours, minutes) => `${hours} ч ${minutes} мин`,
    elapsedMinutes: (minutes, seconds) => `${minutes} мин ${seconds} с`,
    farmIdle:
      'Запускает игры, в которых ещё выпадают карточки, пока они не закончатся',
    farmChecking: 'Читаем значки…',
    farmDone: 'Карточек больше не выпадет',
    dropsLeft: (drops, games) =>
      `Осталось ${drops} ${plural('ru', drops, { one: 'карточка', few: 'карточки', other: 'карточек' })} в ${games} ${plural('ru', games, { one: 'игре', other: 'играх' })}`,
    farmPlaying: (name) => `играет в ${name}`,
    buildingHours: (games) =>
      `набирает часы в ${games} ${plural('ru', games, { one: 'игре', other: 'играх' })}`,
    nextCheck: (minutes) => `следующая проверка через ${minutes} мин`,
  },

  picker: {
    tryAgain: 'Попробовать снова',
    title: 'Добавить игры',
    picked: (count, room) => `Выбрано · ${count} из ${room}`,
    find: 'Найти игру',
    findPlaceholder: 'Название или app ID',
    loading: 'Загружаем игры аккаунта…',
    noGames: 'Steam не показывает игр, или сведения об играх аккаунта скрыты.',
    app: (id) => `Приложение ${id}`,
    hours: (hours) => `${hours} ч`,
    done: 'Готово',
    inLibrary: 'В библиотеке',
    freeToAdd: 'Бесплатные',
    freeHint: 'добавятся на аккаунт, когда он начнёт играть',
    free: 'Бесплатно',
  },
}
