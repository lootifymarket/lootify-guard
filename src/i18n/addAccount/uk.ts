import type { addAccount as en } from './en.ts'

export const addAccount: typeof en = {
  steps: ['Вхід', 'Steam Guard', 'Код відновлення'],

  signInTitle: 'Вхід у Steam',
  login: 'Логін',
  password: 'Пароль',
  proxy: 'Проксі',
  noProxy: 'Без проксі',
  savePassword: 'Зберегти пароль, а не лише сесію',
  savePasswordLabel: 'Зберегти пароль',
  wrongLogin: 'Steam каже, що логін або пароль неправильний',
  signingIn: 'Входимо…',
  signIn: 'Увійти',

  guardTitle: 'Steam Guard',
  guardOnPhone: (name) => `У ${name} Steam Guard стоїть на телефоні.`,
  noAuthenticator: (name) => `У ${name} немає мобільного автентифікатора.`,
  method: 'Спосіб',
  methods: {
    new: {
      name: 'Додати новий автентифікатор',
      text: 'Створюється тут і підтверджується кодом, який Steam надішле SMS або на пошту.',
    },
    move: {
      name: 'Перенести з телефона',
      text: 'Офіційно через Steam, з підтвердженням SMS на номер акаунта. На телефоні Guard перестане працювати.',
      noPhone:
        'До акаунта не прив’язано номер, на який Steam міг би надіслати SMS. Скористайтеся кодом відновлення або .maFile.',
    },
    revocationCode: {
      name: 'Замінити за кодом відновлення',
      text: 'Код є в застосунку Steam на телефоні, у налаштуваннях Steam Guard. Він знімає Guard з телефона, а новий Steam підтвердить кодом на пошту.',
    },
    maFile: {
      name: 'Імпортувати його .maFile',
      text: 'Якщо .maFile акаунта збережено з SDA або іншого застосунку. Guard і далі працюватиме там, де він зараз.',
    },
  },
  revocationCodeLabel: 'Код відновлення',
  chooseMaFile: 'Вибрати .maFile',
  tradeHold:
    'Перші 7 днів після додавання Guard трейди затримуються. Так працює Steam.',
  askingSteam: 'Питаємо Steam…',

  revocationTitle: 'Код відновлення',
  revocationLead: (name) =>
    `Єдиний спосіб зняти Steam Guard з ${name}, якщо сховище загубиться. Збережіть копію поза цим комп’ютером.`,
  copy: 'Копіювати',
  saveTxt: 'Зберегти .txt',
  savedAs: (file) => `Збережено як ${file}`,
  stored: 'Я зберіг код у надійному місці',
  noRevocation: (name) => `${name} додано, але Steam не видав код відновлення.`,
  done: 'Готово',

  guardCode: 'Код Steam Guard',
  emailCode: 'Код із пошти',
  moveFromPhone: 'Перенесення з телефона',
  confirmationCode: 'Код підтвердження',
  code: 'Код',
  checking: 'Перевіряємо…',
  confirm: 'Підтвердити',
  signInPhoneText:
    'Введіть код, який Steam Guard показує в застосунку Steam на телефоні акаунта.',
  signInEmailText: 'Steam надіслав код на пошту акаунта.',
  guardEmailText:
    'Steam надіслав код на пошту акаунта. Введіть його, щоб увімкнути новий автентифікатор.',
  phoneEnding: (digits) => `номер, що закінчується на ${digits}`,
  accountPhone: 'номер телефона акаунта',
  smsMove: (phone) =>
    `Steam надіслав SMS на ${phone}. Щойно ви введете код, Guard на телефоні перестане працювати.`,
  smsNew: (phone) =>
    `Steam надіслав SMS на ${phone}. Введіть код, щоб увімкнути новий автентифікатор.`,
  guardAdded: 'Steam Guard додано',
}
