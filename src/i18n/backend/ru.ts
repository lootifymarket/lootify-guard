import type { BackendMessage } from './en.ts'

export const backend: Record<BackendMessage, string> = {
  // Steam
  'wrong login or password': 'неверный логин или пароль',
  'too many sign-in attempts, try again later':
    'слишком много попыток входа, попробуйте позже',
  "Steam wants a confirmation this app can't give, such as an email code":
    'Steam просит подтверждение, которое это приложение дать не может, например код из письма',
  'wrong code, check it and try again':
    'неверный код, проверьте и попробуйте снова',
  'Steam wants a phone number on the account first':
    'Steam сначала просит привязать к аккаунту номер телефона',
  'Steam moves Guard by SMS, and the account has no phone number: use the revocation code instead':
    'Steam переносит Guard через SMS, а к аккаунту не привязан номер: используйте код восстановления',
  'open the link in the email Steam sent, then try again':
    'откройте ссылку из письма от Steam и попробуйте снова',
  'the account already has Steam Guard on another device':
    'на аккаунте уже есть Steam Guard на другом устройстве',
  'wrong revocation code, {} tries left':
    'неверный код восстановления, осталось попыток: {}',
  'the Steam session has ended, sign in again':
    'сессия Steam закончилась, войдите снова',
  'not a link from a Steam sign-in QR code':
    'это не ссылка из QR-кода входа в Steam',
  "couldn't reach Steam, check the connection":
    'не удалось связаться со Steam, проверьте подключение',
  'Steam took too long to answer, try again':
    'Steam слишком долго не отвечал, попробуйте снова',
  "Steam's servers are busy, try again in a minute":
    'серверы Steam заняты, попробуйте через минуту',
  'Steam is getting too many requests from this address, wait a few minutes':
    'Steam получает слишком много запросов с этого адреса, подождите несколько минут',
  "couldn't reach Steam through the proxy":
    'не удалось связаться со Steam через прокси',
  "Steam rejected the Guard code; this account's authenticator may have been removed or moved":
    'Steam отклонил код Guard: возможно, аутентификатор этого аккаунта удалили или перенесли',
  'Steam said: {}': 'Steam ответил: {}',
  'Steam answered with something unexpected ({})':
    'Steam ответил что-то неожиданное ({})',
  'it kept redirecting': 'бесконечные перенаправления',
  'it kept redirecting to {}': 'бесконечные перенаправления на {}',
  'the answer was cut off': 'ответ оборвался',
  'unexpected response': 'неожиданный ответ',
  'Steam refused, try again': 'Steam отказал, попробуйте снова',
  'no session was issued': 'сессия не выдана',
  'no profile in the answer': 'в ответе нет профиля',
  'avatar too large': 'аватар слишком большой',
  'unreadable answer': 'нечитаемый ответ',
  'unreadable profile': 'нечитаемый профиль',
  'unreadable session token': 'нечитаемый токен сессии',
  'unreadable avatar digest': 'нечитаемый хеш аватара',
  'unreadable trade offer': 'нечитаемое предложение обмена',
  'unreadable trade offers': 'нечитаемые предложения обмена',
  'unreadable discovery queue': 'нечитаемая очередь открытий',
  'unreadable sale item answer': 'нечитаемый ответ о предмете распродажи',
  'unreadable list of games': 'нечитаемый список игр',
  'unreadable inventory': 'нечитаемый инвентарь',
  'unreadable store page': 'нечитаемая страница магазина',
  'unreadable item name': 'нечитаемое название предмета',
  'unreadable wallet': 'нечитаемый кошелёк',
  'unreadable trade token': 'нечитаемый токен трейд-ссылки',
  'unreadable message from Steam': 'нечитаемое сообщение от Steam',
  'unreadable server list': 'нечитаемый список серверов',
  'unreadable API key page': 'нечитаемая страница API-ключа',
  'unreadable device id': 'нечитаемый ID устройства',
  'unreadable device list': 'нечитаемый список устройств',
  'unreadable profile settings': 'нечитаемые настройки профиля',
  'unreadable privacy settings': 'нечитаемые настройки приватности',
  'no {} on the page "{}"': 'нет {} на странице «{}»',
  'item picture too large': 'картинка предмета слишком большая',
  'unknown item picture': 'неизвестная картинка предмета',

  // Signing in, Guard and confirmations
  "Steam couldn't add an authenticator":
    'Steam не смог добавить аутентификатор',
  "Steam didn't accept the new authenticator's codes":
    'Steam не принял коды нового аутентификатора',
  'Steam wants more codes': 'Steam просит ещё коды',
  'no identity secret': 'нет identity secret',
  'nothing to confirm': 'подтверждать нечего',
  'this sign-in has ended, start adding the account again':
    'этот вход закончился, начните добавлять аккаунт заново',
  "the account's Steam Guard is already off, add a new one":
    'Steam Guard аккаунта уже снят, добавьте новый',
  'this .maFile is for another account': 'этот .maFile от другого аккаунта',
  'this .maFile is from an older Steam Guard, Steam no longer takes its codes':
    'этот .maFile от прежнего Steam Guard, Steam больше не принимает его коды',
  'this replacement has ended, start it again':
    'эта замена закончилась, начните её заново',
  "the old Steam Guard is off the account, but the new one isn't on yet: {}":
    'старый Steam Guard снят с аккаунта, а новый ещё не включён: {}',
  'no revocation code': 'нет кода восстановления',
  'this sign-in request has expired': 'этот запрос на вход истёк',
  'this sign-in was already answered': 'на этот вход уже ответили',
  'unknown sign-in request': 'неизвестный запрос на вход',
  'the shared secret is damaged': 'shared secret повреждён',
  'damaged shared secret': 'повреждённый shared secret',
  'shared secret is not valid base64': 'shared secret — не корректный base64',
  'Steam turned down the client sign-in': 'Steam отклонил вход клиента',
  'no client sign-in was issued': 'вход клиента не выдан',
  'the client sign-in failed (code {})': 'вход клиента не удался (код {})',
  'Steam signed the connection out (code {})':
    'Steam разорвал соединение (код {})',

  // The vault and the computer
  'the account is no longer in the vault': 'аккаунта больше нет в хранилище',
  'this account is already in the vault': 'этот аккаунт уже есть в хранилище',
  'this account has no revocation code':
    'у этого аккаунта нет кода восстановления',
  'the system clock is set before 1970':
    'системные часы выставлены раньше 1970 года',
  "the vault couldn't be read": 'не удалось прочитать хранилище',
  'waiting for the vault to be unlocked': 'ждём, пока хранилище откроют',
  'not a Lootify Guard vault': 'это не хранилище Lootify Guard',
  'a vault already exists at this path': 'по этому пути уже есть хранилище',
  'wrong password or the vault is damaged':
    'неверный пароль или хранилище повреждено',
  'vault format version {} is not supported':
    'версия формата хранилища {} не поддерживается',
  'vault contents are damaged at line {}, column {}':
    'содержимое хранилища повреждено в строке {}, столбце {}',
  'key derivation failed: {}': 'не удалось получить ключ: {}',
  "biometric unlock isn't available on this computer":
    'биометрическая разблокировка недоступна на этом компьютере',
  'no vault key is stored for biometric unlock':
    'для биометрической разблокировки не сохранён ключ хранилища',
  'Touch ID failed': 'Touch ID не сработал',
  'keychain: {}': 'связка ключей: {}',
  "couldn't change the startup item: {}": 'не удалось изменить автозапуск: {}',
  'pick 5, 15 or 60 minutes': 'выберите 5, 15 или 60 минут',
  cancelled: 'отменено',

  // .maFile import
  'not a .maFile (broken at line {}, column {})':
    'это не .maFile (ошибка в строке {}, столбце {})',
  'the file has no {}': 'в файле нет поля {}',
  'account name': 'имя аккаунта',
  '{} in the file is damaged': '{} в файле повреждено',
  'the file is too large to be a .maFile': 'файл слишком большой для .maFile',
  'the file is encrypted by Steam Desktop Authenticator, turn off encryption in SDA first':
    'файл зашифрован Steam Desktop Authenticator, сначала отключите шифрование в SDA',

  // Profile, security, trades, market
  "the change wasn't saved": 'изменение не сохранилось',
  "the avatar wasn't saved": 'аватар не сохранился',
  "the file isn't a JPEG, PNG or GIF": 'файл не JPEG, PNG или GIF',
  'the image is over 1 MB': 'картинка больше 1 МБ',
  "the image isn't a JPEG, PNG or GIF": 'картинка не JPEG, PNG или GIF',
  'Steam made no new trade URL': 'Steam не выдал новую трейд-ссылку',
  'no trade URL on the page': 'на странице нет трейд-ссылки',
  'no wallet on the market page': 'на странице маркета нет кошелька',
  'the account no longer has a Web API key':
    'у аккаунта больше нет ключа Web API',
  'the key is still there': 'ключ всё ещё на месте',
  'keep the name under {} characters':
    'название должно быть не длиннее {} символов',
  'keep the note under {} characters': 'заметка должна быть короче {} символов',
  "that is this app's own session": 'это сессия самого приложения',
  'Steam refused to sign that device out':
    'Steam не дал завершить сеанс этого устройства',
  'unknown trade offer': 'неизвестное предложение обмена',
  'unknown trade partner': 'неизвестный партнёр по обмену',
  "that isn't a Steam trade URL": 'это не трейд-ссылка Steam',
  'pick at least one item': 'выберите хотя бы один предмет',
  "the item wasn't listed": 'предмет не выставлен',
  'the price is too low': 'цена слишком низкая',
  "this account's wallet is in {}, not {}":
    'кошелёк этого аккаунта в {}, а не в {}',
  'another currency': 'другой валюте',

  // Proxies and groups
  'the proxy is no longer in the vault': 'прокси больше нет в хранилище',
  "the account's proxy is no longer in the vault":
    'прокси аккаунта больше нет в хранилище',
  'expected host:port, optionally with a login and password':
    'нужен формат host:port, можно с логином и паролем',
  'the port must be a number from 1 to 65535':
    'порт должен быть числом от 1 до 65535',
  'unknown proxy type, use http:// or socks5://':
    'неизвестный тип прокси, используйте http:// или socks5://',
  'give the group a name': 'дайте группе название',
  "there's already a group with that name": 'группа с таким названием уже есть',
  'give the profile a name': 'дайте профилю название',
  "there's already a profile with that name":
    'профиль с таким названием уже есть',
  'the profile is no longer in the vault':
    'этого профиля больше нет в хранилище',
  'unknown time zone': 'неизвестный часовой пояс',
  'the group is no longer in the vault': 'группы больше нет в хранилище',

  // Free games
  "the license wasn't added": 'лицензия не добавлена',
  'the store has no such app': 'в магазине нет такого приложения',
  "it isn't free in the store": 'в магазине она не бесплатная',
  "it isn't a free package": 'это не бесплатный пакет',
  "not available in this account's region":
    'недоступно в регионе этого аккаунта',
  "it needs a game the account doesn't own":
    'нужна игра, которой нет на аккаунте',
  'too many licenses lately, try again in an hour':
    'слишком много лицензий за последнее время, попробуйте через час',
  'purchase error {}': 'ошибка покупки {}',
  'app {}: {}': 'app {}: {}',
  'sub {}: {}': 'sub {}: {}',
  'Added {}': 'Добавлено: {}',
  '{} already owned': 'уже есть: {}',

  // Starting a task
  'pick at least one account': 'выберите хотя бы один аккаунт',
  'pick something to change': 'выберите, что изменить',
  'pick something to do': 'выберите, что сделать',
  'the nickname would be over 32 characters':
    'никнейм получится длиннее 32 символов',
  'can\'t read "{}": use store links, app/440 or sub/12345':
    'не удалось прочитать «{}»: используйте ссылки из магазина, app/440 или sub/12345',
  'can\'t read "{}": use app IDs or store links':
    'не удалось прочитать «{}»: используйте ID приложений или ссылки из магазина',
  'sub {} is a package, use its app ID':
    'sub {} — это пакет, укажите ID приложения',
  'add a game': 'добавьте игру',
  'add a game or a status': 'добавьте игру или статус',
  'a plan lasts from 1 to 30 days': 'план длится от 1 до 30 дней',
  'the hours have to end later than they start':
    'конец часов должен быть позже начала',
  'pick at least one step': 'выберите хотя бы один шаг',
  'can\'t read "{}": use links like steamcommunity.com/groups/name':
    'не удалось прочитать «{}»: укажите ссылки вида steamcommunity.com/groups/name',
  'add a group': 'добавьте группу',
  'list at most {} groups': 'не больше {} групп',
  'list at most {} games': 'не больше {} игр',
  'Joined {}': 'Вступил: {}',
  'none of the links lead to a group': 'ни одна ссылка не ведёт на группу',
  'Already in every group it can join':
    'Уже во всех группах, куда можно вступить',
  'Added to the wishlist: {}': 'Добавлено в вишлист: {}',
  'Every game is owned or on the wishlist already':
    'Все игры уже куплены или в вишлисте',
  "the store didn't take any of the games": 'магазин не принял ни одной игры',
  'unreadable store data': 'нечитаемые данные магазина',
  "Steam didn't let it join": 'Steam не дал вступить',
  description: 'описание',
  'pick at least one piece besides dividers':
    'выберите хотя бы одну часть, кроме разделителей',
  'add at least one line': 'добавьте хотя бы одну строку',
  'the status is over 64 characters': 'статус длиннее 64 символов',
  'Steam plays at most 32 games at once, the status counts as one':
    'Steam запускает не больше 32 игр одновременно, статус считается за одну',
  'Steam plays at most {} games at once':
    'Steam запускает не больше {} игр одновременно',
  'Steam takes about {} free games an hour, add fewer':
    'Steam принимает около {} бесплатных игр в час, добавьте меньше',
  'sales reward at most {} queues a day':
    'на распродажах награждают максимум за {} очереди в день',

  // How a task went
  'All clear': 'Всё в порядке',
  'Web API key for {}': 'ключ Web API для {}',
  'VAC banned': 'VAC-бан',
  'game banned': 'игровой бан',
  'trade banned': 'бан на обмен',
  'on trade probation': 'испытательный срок на обмен',
  'market restricted': 'ограничения на маркете',
  limited: 'ограниченный аккаунт',
  'Accepted 1 gift': 'Принят 1 подарок',
  'Accepted {} gifts': 'Принято подарков: {}',
  'No gifts waiting': 'Подарков нет',
  '{} failed: {}': 'не удалось: {}, причина: {}',
  'Changed {}': 'Изменено: {}',
  'nickname to {}': 'никнейм на {}',
  privacy: 'приватность',
  avatar: 'аватар',
  'Nothing to move': 'Переносить нечего',
  'Moved {}': 'Перенесено: {}',
  '1 item': '1 предмет',
  '{} items': '{} шт.',
  "Sent {}, but the storage account didn't take them: {}":
    'Отправлено: {}, но аккаунт-хранилище их не принял: {}',
  'viewed {} games in the discovery queue':
    'просмотрено игр в очереди открытий: {}',
  'the discovery queue was empty': 'очередь открытий была пустой',
  'claimed the free sale item': 'бесплатный предмет распродажи получен',
  'sale item already claimed, next in {} h':
    'предмет распродажи уже получен, следующий через {} ч',
  'no sale item to claim': 'предмета распродажи нет',
  'Playing 1 game': 'Запущена 1 игра',
  'Playing {} games': 'Запущено игр: {}',
  Offline: 'Не в сети',
  "Wasn't playing": 'Не играл',
  '1 game with {} card drops left': '1 игра, осталось карточек: {}',
  '{} games with {} card drops left': 'игр: {}, осталось карточек: {}',
  'No card drops left': 'Карточек больше не выпадет',
  'Steam took too long to answer, still trying':
    'Steam слишком долго не отвечает, продолжаем пытаться',
  stopped: 'остановлено',
  'the browser tab is closed': 'вкладка браузера закрыта',
  "could not start the tab's proxy": 'не удалось запустить прокси вкладки',
  'the proxy is no longer there': 'этого прокси больше нет',
  'not a web address': 'не похоже на веб-адрес',
  'there are already {} bookmarks, remove one first':
    'закладок уже {}, сначала уберите одну',
  "the page hasn't loaded yet": 'страница ещё не загрузилась',
  "couldn't install the update": 'не удалось установить обновление',
  "the update hasn't finished downloading": 'обновление ещё не скачалось',
}
