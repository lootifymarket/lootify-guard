import type { addAccount as en } from './en.ts'

export const addAccount: typeof en = {
  steps: ['Вход', 'Steam Guard', 'Код восстановления'],

  signInTitle: 'Вход в Steam',
  login: 'Логин',
  password: 'Пароль',
  proxy: 'Прокси',
  noProxy: 'Без прокси',
  savePassword: 'Сохранить пароль, а не только сессию',
  savePasswordLabel: 'Сохранить пароль',
  wrongLogin: 'Steam говорит, что логин или пароль неверный',
  signingIn: 'Входим…',
  signIn: 'Войти',

  guardTitle: 'Steam Guard',
  guardOnPhone: (name) => `У ${name} Steam Guard стоит на телефоне.`,
  noAuthenticator: (name) => `У ${name} нет мобильного аутентификатора.`,
  method: 'Способ',
  methods: {
    new: {
      name: 'Добавить новый аутентификатор',
      text: 'Создаётся здесь и подтверждается кодом, который Steam пришлёт по SMS или на почту.',
      unavailable:
        'Steam Guard уже стоит на телефоне. Перенесите его или импортируйте его .maFile из списка аккаунтов.',
    },
    move: {
      name: 'Перенести с телефона',
      text: 'Официально через Steam, с подтверждением по SMS. На телефоне Guard перестанет работать.',
      unavailable:
        'На телефоне этого аккаунта нет Steam Guard, переносить нечего.',
    },
  },
  tradeHold:
    'Первые 7 дней после добавления Guard трейды задерживаются. Так устроен Steam.',
  askingSteam: 'Спрашиваем Steam…',

  revocationTitle: 'Код восстановления',
  revocationLead: (name) =>
    `Единственный способ снять Steam Guard с ${name}, если хранилище потеряется. Сохраните копию вне этого компьютера.`,
  copy: 'Копировать',
  saveTxt: 'Сохранить .txt',
  savedAs: (file) => `Сохранено как ${file}`,
  stored: 'Я сохранил код в надёжном месте',
  noRevocation: (name) =>
    `${name} добавлен, но Steam не выдал код восстановления.`,
  done: 'Готово',

  guardCode: 'Код Steam Guard',
  emailCode: 'Код из почты',
  moveFromPhone: 'Перенос с телефона',
  confirmationCode: 'Код подтверждения',
  code: 'Код',
  checking: 'Проверяем…',
  confirm: 'Подтвердить',
  signInPhoneText:
    'Введите код, который Steam Guard показывает в приложении Steam на телефоне аккаунта.',
  signInEmailText: 'Steam отправил код на почту аккаунта.',
  guardEmailText:
    'Steam отправил код на почту аккаунта. Введите его, чтобы включить новый аутентификатор.',
  phoneEnding: (digits) => `номер, который заканчивается на ${digits}`,
  accountPhone: 'номер телефона аккаунта',
  smsMove: (phone) =>
    `Steam отправил SMS на ${phone}. Как только вы введёте код, Guard на телефоне перестанет работать.`,
  smsNew: (phone) =>
    `Steam отправил SMS на ${phone}. Введите код, чтобы включить новый аутентификатор.`,
  guardAdded: 'Steam Guard добавлен',
}
