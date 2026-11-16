import { plural } from '../plural.ts'
import type { updates as en } from './en.ts'

export const updates: typeof en = {
  available: 'Доступне оновлення',
  availableSub: (version: string) => `Версія ${version}`,
  downloading: (version: string) => `Завантажується ${version}`,
  ready: 'Перезапустити для оновлення',
  readySub: (version: string) => `${version} готова`,
  title: (version: string) => `Lootify Guard ${version}`,
  youHave: (current: string) => `У вас ${current}`,
  installedNow: 'Щойно встановлено',
  whatsNew: 'Що нового',
  noNotes: 'У цьому випуску немає опису.',
  busyTitle: 'Перезапуск зупинить те, що зараз працює',
  busyTasks: (n: number) =>
    `${n} ${plural('uk', n, { one: 'завдання', few: 'завдання', other: 'завдань' })}`,
  busyGames: (n: number) =>
    `${n} ${plural('uk', n, { one: 'акаунт грає', few: 'акаунти грають', other: 'акаунтів грають' })}`,
  busyTabs: (n: number) =>
    `${n} ${plural('uk', n, { one: 'вкладка браузера', few: 'вкладки браузера', other: 'вкладок браузера' })}`,
  busyAfter:
    'Після перезапуску відкрийте сховище паролем і запустіть їх знову.',
  progress: (done: string, total: string) => `${done} з ${total} МБ`,
  installing: 'Встановлення…',
  signed: 'Оновлення підписане Lootify і перевіряється перед встановленням.',
  failed:
    'Не вдалося завантажити оновлення. Перевірте з’єднання і спробуйте ще.',
  updateAndRestart: 'Оновити й перезапустити',
  restartNow: 'Перезапустити',
  restartAnyway: 'Все одно перезапустити',
  tryAgain: 'Спробувати ще',
  later: 'Пізніше',
  back: 'Назад',
  hide: 'Сховати',
  close: 'Закрити',
  updated: (version: string) => `Оновлено до ${version}`,
  settings: {
    title: 'Оновлення',
    auto: 'Оновлювати автоматично',
    autoHint: 'Завантажує у фоні й встановлює під час наступного перезапуску.',
    version: 'Версія',
    upToDate: (when: string) => `Остання версія · перевірено ${when} тому`,
    upToDateNow: 'Остання версія · перевірено щойно',
    notChecked: 'Ще не перевірялося',
    checking: 'Перевірка…',
    availableNote: (version: string) => `Доступна ${version}`,
    downloadingNote: (version: string, percent: number) =>
      `Завантажується ${version} · ${percent}%`,
    readyNote: (version: string) =>
      `${version} завантажена й встановиться під час перезапуску`,
    failedNote: 'Не вдалося перевірити оновлення',
    check: 'Перевірити',
    update: 'Оновити…',
    restart: 'Перезапустити',
  },
}
