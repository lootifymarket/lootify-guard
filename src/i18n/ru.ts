import type { Dictionary } from './en.ts'
import { accounts } from './accounts/ru.ts'
import { guard } from './guard/ru.ts'
import { account } from './account/ru.ts'
import { addAccount } from './addAccount/ru.ts'
import { groups } from './groups/ru.ts'
import { trades } from './trades/ru.ts'
import { inventory } from './inventory/ru.ts'
import { tasks } from './tasks/ru.ts'
import { proxies } from './proxies/ru.ts'
import { browser } from './browser/ru.ts'
import { updates } from './updates/ru.ts'

export const ru: Dictionary = {
  accounts,
  guard,
  account,
  addAccount,
  groups,
  trades,
  inventory,
  tasks,
  proxies,
  browser,
  updates,

  common: {
    back: 'Назад',
    cancel: 'Отмена',
    save: 'Сохранить',
    continue: 'Продолжить',
    change: 'Сменить',
    export: 'Экспорт',
    copied: 'Скопировано',
    copyFailed: 'Не удалось скопировать',
  },

  errors: {
    wrongPassword: 'Неверный пароль',
    locked: 'Хранилище заблокировано',
    biometricsOutdated:
      'Биометрия больше не подходит к этому хранилищу. Войдите по паролю.',
    cancelled: 'Отменено',
  },

  time: {
    justNow: 'только что',
    minutes: (n) => `${n} мин`,
    hours: (n) => `${n} ч`,
    days: (n) => `${n} д`,
  },

  onboarding: {
    steps: ['Приветствие', 'Мастер-пароль', 'Настройки'],
    promises: [
      {
        title: 'Всё остаётся на компьютере',
        text: 'Никакого облака. Секреты шифруются здесь и никогда не покидают это устройство.',
      },
      {
        title: 'Открытый код',
        text: 'Каждая строка есть на GitHub, любой может проверить, что делает приложение.',
      },
      {
        title: 'Для трейдеров и ферм',
        text: 'Коды Guard, подтверждения, трейды, прокси и массовые задачи.',
      },
    ],
    asideNote:
      'Всё хранится на этом компьютере и шифруется мастер-паролем. Lootify никогда не получает ваши пароли и секреты Steam Guard.',
    welcomeTitle: 'Добро пожаловать в Lootify Guard',
    welcomeLead:
      'Коды Steam Guard, подтверждения трейдов и все ваши аккаунты Steam в одном зашифрованном хранилище на этом компьютере.',
    getStarted: 'Начать',
    createTitle: 'Придумайте мастер-пароль',
    createLead:
      'Он шифрует хранилище, и его нужно вводить при каждом запуске. Без него хранилище не прочитает никто, даже мы.',
    masterPassword: 'Мастер-пароль',
    repeatPassword: 'Повторите пароль',
    passphraseHint:
      'Возьмите длинную фразу. Хорошо подходят четыре и больше случайных слов.',
    weak: 'Слабый пароль',
    good: 'Хороший пароль',
    strong: 'Надёжный пароль',
    mismatch: 'Пароли не совпадают',
    recommended: 'Рекомендуется',
    rules: {
      length: 'Не меньше 12 символов',
      lengthMissing: 'Короче 12 символов',
      numberOrSymbol: 'Цифра или символ',
      numberOrSymbolMissing: 'Нет цифр и символов',
      mixedCase: 'Заглавные и строчные буквы',
      mixedCaseMissing: 'Нет и заглавных, и строчных букв',
    },
    unlockWith: (name) => `Разблокировка через ${name}`,
    unlockWithText:
      'А ещё позволит задать новый пароль на этом компьютере, если вы его забудете.',
    biometricFailed: (name, error) =>
      `Хранилище готово, но ${name} включить не удалось: ${error}`,
    creating: 'Создаём хранилище…',
    create: 'Создать хранилище',
    weakTitle: 'Этот пароль легко подобрать',
    weakText:
      'Если вредоносная программа скопирует файл хранилища, слабый пароль подберут за несколько часов, и все секреты Steam Guard окажутся у них. Длинную фразу подбирают годами.',
    useAnyway: 'Всё равно оставить',
    makeStronger: 'Сделать надёжнее',
    prefsTitle: 'Немного настроек',
    prefsLead: 'Всё это можно поменять потом в настройках.',
  },

  unlock: {
    footnote: 'Ваши данные зашифрованы и хранятся только на этом устройстве.',
    enterPassword: 'Введите пароль',
    decrypting: 'Расшифровываем хранилище…',
    prompt: 'Введите мастер-пароль, чтобы открыть хранилище.',
    masterPassword: 'Мастер-пароль',
    opening: 'Открываем…',
    unlock: 'Открыть',
    unlockWith: (name) => `Открыть через ${name}`,
    forgot: 'Забыли пароль?',
    recoverTitle: 'Сброс пароля',
    recoverText: (name) =>
      `Для этого хранилища включён ${name}. Подтвердите, что это вы, и задайте новый мастер-пароль.`,
    verifiedWith: (name) => `Подтверждено через ${name}`,
    newPassword: 'Новый мастер-пароль',
    repeatPassword: 'Повторите пароль',
    recommended: 'Рекомендуется от 12 символов',
    mismatch: 'Пароли не совпадают',
    weak: 'Слабый: его легко подобрать, если файл хранилища украдут',
    looksGood: 'Подходит',
    repeat: 'Повторите пароль',
    reencrypting: 'Перешифровываем хранилище…',
    saveAndUnlock: 'Сохранить и открыть',
    waitingFor: (name) => `Ждём ${name}…`,
    verifyWith: (name) => `Подтвердить через ${name}`,
    unavailable: (name) => `${name} недоступен`,
    resetTitle: 'Хранилище не открыть',
    resetText: (name) =>
      `Без пароля${name ? ` или ${name}` : ''} его не расшифрует никто, даже мы. В этом и смысл шифрования. Сотрите его и начните заново: аккаунты Steam от этого не пропадут.`,
    waysTitle: 'Как вернуть аккаунты после сброса',
    ways: [
      {
        title: 'Восстановить из резервной копии',
        text: 'Импортируйте файлы .maFile или копию хранилища, сделанную в настройках.',
      },
      {
        title: 'Коды восстановления Steam',
        text: 'Каждый R-код снимает Steam Guard со своего аккаунта. После этого аккаунт можно добавить снова.',
      },
      {
        title: 'Поддержка Steam',
        text: 'Для аккаунтов без резервной копии и без R-кода.',
      },
    ],
    resetWord: 'RESET',
    typeReset: 'Введите RESET, чтобы стереть хранилище',
    erasing: 'Стираем…',
    erase: 'Стереть хранилище и начать заново',
    remembered: '← Я вспомнил пароль',
  },

  splash: {
    steps: ['Проверяем целостность', 'Загружаем настройки', 'Готово'],
    by: 'от Lootify Market',
  },

  sidebar: {
    menu: 'Главное меню',
    accounts: 'Аккаунты',
    guard: 'Steam Guard',
    trades: 'Трейды',
    inventory: 'Инвентарь',
    tasks: 'Задачи',
    proxies: 'Прокси',
    add: 'Добавить аккаунт',
    settings: 'Настройки',
    vaultUnlocked: 'Хранилище открыто',
    locksIn: (minutes) => `Закроется через ${minutes} мин`,
    lock: 'Заблокировать',
    streamerOn: 'Режим стримера включён',
    streamerOff: 'Выключить режим стримера',
    collapse: 'Свернуть меню',
    expand: 'Развернуть меню',
    version: (version) => `v${version} · открытый код`,
  },

  settings: {
    title: 'Настройки',
    display: 'Отображение',
    language: 'Язык',
    streamer: 'Режим стримера',
    streamerHint:
      'Скрывает балансы, цены, коды Steam Guard, SteamID и трейд-ссылки.',
    security: 'Безопасность',
    autoLock: 'Автоблокировка',
    autoLockHint:
      'Блокирует хранилище, если столько времени ничего не происходит. Автоподтверждение работает, только пока оно открыто.',
    minutes: (n) => (n === 60 ? '1 час' : `${n} минут`),
    never: 'Никогда',
    unlockWith: (name) => `Разблокировка через ${name}`,
    biometricHint: (name) =>
      `Ключ хранилища лежит в связке ключей, и приложение спрашивает ${name}, прежде чем его взять.`,
    masterPassword: 'Мастер-пароль',
    backup: 'Резервная копия',
    backupNever: 'Ещё не сохранялась. ',
    backupJustNow: 'Сохранена только что. ',
    backupAgo: (when) => `Сохранена ${when} назад. `,
    backupHint:
      'В файле все аккаунты и секреты Guard, зашифрованные мастер-паролем.',
    backupSaved: 'Резервная копия сохранена',
    app: 'Приложение',
    startup: 'Запускать вместе с системой',
    startupHint: 'Запускается в трее с заблокированным хранилищем.',
    tray: 'Работать в трее',
    trayHint:
      'После закрытия окна автоподтверждение, игры и фарм карточек продолжают работать. Выйти можно через иконку в трее.',
    passwordChanged: 'Мастер-пароль изменён',
  },

  changePassword: {
    title: 'Смена мастер-пароля',
    current: 'Текущий пароль',
    new: 'Новый пароль',
    repeat: 'Повторите новый пароль',
    mismatch: 'Пароли не совпадают',
    weak: 'Слабый: нужно от 12 символов, разный регистр и цифра или символ',
    movesBiometric: (name) =>
      `Хранилище перешифруется, а ${name} перейдёт на новый пароль.`,
    reencrypted: 'Хранилище перешифруется под новый пароль.',
    wrongCurrent: 'Текущий пароль неверный',
    reencrypting: 'Перешифровываем…',
  },
}
