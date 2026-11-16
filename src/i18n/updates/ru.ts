import { plural } from '../plural.ts'
import type { updates as en } from './en.ts'

export const updates: typeof en = {
  available: 'Доступно обновление',
  availableSub: (version: string) => `Версия ${version}`,
  downloading: (version: string) => `Скачивается ${version}`,
  ready: 'Перезапустить для обновления',
  readySub: (version: string) => `${version} готова`,
  title: (version: string) => `Lootify Guard ${version}`,
  youHave: (current: string) => `У вас ${current}`,
  installedNow: 'Только что установлено',
  whatsNew: 'Что нового',
  noNotes: 'В этом выпуске нет описания.',
  busyTitle: 'Перезапуск остановит то, что сейчас работает',
  busyTasks: (n: number) =>
    `${n} ${plural('ru', n, { one: 'задача', few: 'задачи', other: 'задач' })}`,
  busyGames: (n: number) =>
    `${n} ${plural('ru', n, { one: 'аккаунт играет', few: 'аккаунта играют', other: 'аккаунтов играют' })}`,
  busyTabs: (n: number) =>
    `${n} ${plural('ru', n, { one: 'вкладка браузера', few: 'вкладки браузера', other: 'вкладок браузера' })}`,
  busyAfter:
    'После перезапуска откройте хранилище паролем и запустите их снова.',
  progress: (done: string, total: string) => `${done} из ${total} МБ`,
  installing: 'Установка…',
  signed: 'Обновление подписано Lootify и проверяется перед установкой.',
  failed:
    'Не удалось скачать обновление. Проверьте подключение и попробуйте снова.',
  updateAndRestart: 'Обновить и перезапустить',
  restartNow: 'Перезапустить',
  restartAnyway: 'Всё равно перезапустить',
  tryAgain: 'Повторить',
  later: 'Позже',
  back: 'Назад',
  hide: 'Скрыть',
  close: 'Закрыть',
  updated: (version: string) => `Обновлено до ${version}`,
  settings: {
    title: 'Обновления',
    auto: 'Обновлять автоматически',
    autoHint: 'Скачивает в фоне и ставит при следующем перезапуске.',
    version: 'Версия',
    upToDate: (when: string) => `Последняя версия · проверено ${when} назад`,
    upToDateNow: 'Последняя версия · проверено только что',
    notChecked: 'Ещё не проверялось',
    checking: 'Проверка…',
    availableNote: (version: string) => `Доступна ${version}`,
    downloadingNote: (version: string, percent: number) =>
      `Скачивается ${version} · ${percent}%`,
    readyNote: (version: string) =>
      `${version} скачана и установится при перезапуске`,
    failedNote: 'Не удалось проверить обновления',
    check: 'Проверить',
    update: 'Обновить…',
    restart: 'Перезапустить',
  },
}
