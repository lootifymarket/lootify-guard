import type { BackendMessage } from './en.ts'

export const backend: Record<BackendMessage, string> = {
  'wrong login or password': 'неправильний логін або пароль',
  'too many sign-in attempts, try again later':
    'забагато спроб входу, спробуйте пізніше',
  "Steam wants a confirmation this app can't give, such as an email code":
    'Steam просить підтвердження, яке застосунок не може дати, наприклад код з пошти',
  'wrong code, check it and try again':
    'неправильний код, перевірте його й спробуйте ще раз',
  'Steam wants a phone number on the account first':
    'Steam спершу просить додати до акаунта номер телефону',
  'open the link in the email Steam sent, then try again':
    'відкрийте посилання з листа від Steam і спробуйте ще раз',
  'the account already has Steam Guard on another device':
    'на акаунті вже є Steam Guard на іншому пристрої',
  'the Steam session has ended, sign in again':
    'сесія Steam завершилася, увійдіть знову',
  'not a link from a Steam sign-in QR code':
    'це не посилання з QR-коду входу Steam',
  "couldn't reach Steam, check the connection":
    'не вдалося зв’язатися зі Steam, перевірте з’єднання',
  'Steam took too long to answer, try again':
    'Steam надто довго не відповідав, спробуйте ще раз',
  "Steam's servers are busy, try again in a minute":
    'сервери Steam зайняті, спробуйте за хвилину',
  'Steam is getting too many requests from this address, wait a few minutes':
    'Steam отримує забагато запитів із цієї адреси, зачекайте кілька хвилин',
  "couldn't reach Steam through the proxy":
    'не вдалося зв’язатися зі Steam через проксі',
  "Steam rejected the Guard code; this account's authenticator may have been removed or moved":
    'Steam не прийняв код Guard; можливо, автентифікатор цього акаунта видалили або перенесли',
  'Steam said: {}': 'Steam відповів: {}',
  'Steam answered with something unexpected ({})':
    'Steam відповів чимось неочікуваним ({})',
  'it kept redirecting': 'постійне перенаправлення',
  'it kept redirecting to {}': 'постійне перенаправлення на {}',
  'the answer was cut off': 'відповідь обірвалася',
  'unexpected response': 'неочікувана відповідь',
  'Steam refused, try again': 'Steam відмовив, спробуйте ще раз',
  'no session was issued': 'сесію не видано',
  'no profile in the answer': 'у відповіді немає профілю',
  'avatar too large': 'аватар завеликий',
  'unreadable answer': 'нечитабельна відповідь',
  'unreadable profile': 'нечитабельний профіль',
  'unreadable session token': 'нечитабельний токен сесії',
  'unreadable avatar digest': 'нечитабельний хеш аватара',
  'unreadable trade offer': 'нечитабельна пропозиція обміну',
  'unreadable trade offers': 'нечитабельні пропозиції обміну',
  'unreadable discovery queue': 'нечитабельна черга відкриттів',
  'unreadable sale item answer':
    'нечитабельна відповідь про предмет розпродажу',
  'unreadable list of games': 'нечитабельний список ігор',
  'unreadable inventory': 'нечитабельний інвентар',
  'unreadable store page': 'нечитабельна сторінка магазину',
  'unreadable item name': 'нечитабельна назва предмета',
  'unreadable wallet': 'нечитабельний гаманець',
  'unreadable trade token': 'нечитабельний токен трейду',
  'unreadable message from Steam': 'нечитабельне повідомлення від Steam',
  'unreadable server list': 'нечитабельний список серверів',
  'unreadable API key page': 'нечитабельна сторінка API-ключа',
  'unreadable device id': 'нечитабельний ID пристрою',
  'unreadable device list': 'нечитабельний список пристроїв',
  'unreadable profile settings': 'нечитабельні налаштування профілю',
  'unreadable privacy settings': 'нечитабельні налаштування приватності',
  'no {} on the page "{}"': 'немає {} на сторінці «{}»',
  'item picture too large': 'зображення предмета завелике',
  'unknown item picture': 'невідоме зображення предмета',
  "Steam couldn't add an authenticator": 'Steam не зміг додати автентифікатор',
  "Steam didn't accept the new authenticator's codes":
    'Steam не прийняв коди нового автентифікатора',
  'Steam wants more codes': 'Steam просить більше кодів',
  'no identity secret': 'немає identity secret',
  'nothing to confirm': 'нічого підтверджувати',
  'this sign-in has ended, start adding the account again':
    'цей вхід завершився, почніть додавати акаунт заново',
  'this sign-in request has expired': 'термін цього запиту на вхід минув',
  'this sign-in was already answered': 'на цей вхід уже відповіли',
  'unknown sign-in request': 'невідомий запит на вхід',
  'the shared secret is damaged': 'shared secret пошкоджено',
  'damaged shared secret': 'пошкоджений shared secret',
  'shared secret is not valid base64': 'shared secret — некоректний base64',
  'Steam turned down the client sign-in': 'Steam відхилив вхід клієнта',
  'no client sign-in was issued': 'вхід клієнта не видано',
  'the client sign-in failed (code {})': 'вхід клієнта не вдався (код {})',
  'Steam signed the connection out (code {})':
    'Steam розірвав з’єднання (код {})',
  'the account is no longer in the vault': 'акаунта вже немає у сховищі',
  'this account is already in the vault': 'цей акаунт уже є у сховищі',
  'this account has no revocation code':
    'у цього акаунта немає коду відновлення',
  'the system clock is set before 1970':
    'системний годинник показує дату до 1970 року',
  "the vault couldn't be read": 'не вдалося прочитати сховище',
  'waiting for the vault to be unlocked': 'чекаємо, поки сховище розблокують',
  'not a Lootify Guard vault': 'це не сховище Lootify Guard',
  'a vault already exists at this path': 'за цим шляхом уже є сховище',
  'wrong password or the vault is damaged':
    'неправильний пароль або сховище пошкоджено',
  'vault format version {} is not supported':
    'версія формату сховища {} не підтримується',
  'vault contents are damaged at line {}, column {}':
    'вміст сховища пошкоджено в рядку {}, стовпці {}',
  'key derivation failed: {}': 'не вдалося отримати ключ: {}',
  "biometric unlock isn't available on this computer":
    'біометричне розблокування недоступне на цьому комп’ютері',
  'no vault key is stored for biometric unlock':
    'ключ сховища для біометричного розблокування не збережено',
  'Touch ID failed': 'Touch ID не спрацював',
  'keychain: {}': 'в’язка ключів: {}',
  "couldn't change the startup item: {}": 'не вдалося змінити автозапуск: {}',
  'pick 5, 15 or 60 minutes': 'виберіть 5, 15 або 60 хвилин',
  cancelled: 'скасовано',
  'not a .maFile (broken at line {}, column {})':
    'це не .maFile (помилка в рядку {}, стовпці {})',
  'the file has no {}': 'у файлі немає {}',
  'account name': 'імені акаунта',
  '{} in the file is damaged': '{} у файлі пошкоджено',
  'the file is too large to be a .maFile': 'файл завеликий для .maFile',
  'the file is encrypted by Steam Desktop Authenticator, turn off encryption in SDA first':
    'файл зашифровано Steam Desktop Authenticator, спершу вимкніть шифрування в SDA',
  "the change wasn't saved": 'зміну не збережено',
  "the avatar wasn't saved": 'аватар не збережено',
  "the file isn't a JPEG, PNG or GIF": 'файл не є JPEG, PNG або GIF',
  'the image is over 1 MB': 'зображення більше за 1 МБ',
  "the image isn't a JPEG, PNG or GIF": 'зображення не є JPEG, PNG або GIF',
  'Steam made no new trade URL': 'Steam не створив нове трейд-посилання',
  'no trade URL on the page': 'на сторінці немає трейд-посилання',
  'no wallet on the market page': 'на сторінці маркету немає гаманця',
  'the account no longer has a Web API key':
    'в акаунта більше немає ключа Web API',
  'the key is still there': 'ключ досі на місці',
  'keep the name under {} characters': 'назва має бути коротшою за {} символів',
  'keep the note under {} characters':
    'нотатка має бути коротшою за {} символів',
  "that is this app's own session": 'це власна сесія застосунку',
  'unknown trade offer': 'невідома пропозиція обміну',
  'unknown trade partner': 'невідомий партнер з обміну',
  "that isn't a Steam trade URL": 'це не трейд-посилання Steam',
  'pick at least one item': 'виберіть хоча б один предмет',
  "the item wasn't listed": 'предмет не виставлено',
  'the price is too low': 'ціна занизька',
  "this account's wallet is in {}, not {}":
    'гаманець цього акаунта в {}, а не в {}',
  'another currency': 'іншій валюті',
  'the proxy is no longer in the vault': 'проксі вже немає у сховищі',
  "the account's proxy is no longer in the vault":
    'проксі акаунта вже немає у сховищі',
  'expected host:port, optionally with a login and password':
    'очікується host:port, за потреби з логіном і паролем',
  'the port must be a number from 1 to 65535':
    'порт має бути числом від 1 до 65535',
  'unknown proxy type, use http:// or socks5://':
    'невідомий тип проксі, використайте http:// або socks5://',
  'give the group a name': 'дайте групі назву',
  "there's already a group with that name": 'група з такою назвою вже є',
  'the group is no longer in the vault': 'групи вже немає у сховищі',
  "the license wasn't added": 'ліцензію не додано',
  'the store has no such app': 'у магазині немає такого застосунку',
  "it isn't free in the store": 'у магазині вона не безкоштовна',
  "it isn't a free package": 'це не безкоштовний пакет',
  "not available in this account's region":
    'недоступно в регіоні цього акаунта',
  "it needs a game the account doesn't own":
    'потрібна гра, якої в акаунта немає',
  'too many licenses lately, try again in an hour':
    'забагато ліцензій останнім часом, спробуйте за годину',
  'purchase error {}': 'помилка покупки {}',
  'app {}: {}': 'app {}: {}',
  'sub {}: {}': 'sub {}: {}',
  'Added {}': 'Додано: {}',
  '{} already owned': 'уже є: {}',
  'pick at least one account': 'виберіть хоча б один акаунт',
  'pick something to change': 'виберіть, що змінити',
  'pick something to do': 'виберіть, що зробити',
  'the nickname would be over 32 characters':
    'нікнейм вийде довшим за 32 символи',
  'can\'t read "{}": use store links, app/440 or sub/12345':
    'не вдалося прочитати «{}»: використовуйте посилання на магазин, app/440 або sub/12345',
  'can\'t read "{}": use app IDs or store links':
    'не вдалося прочитати «{}»: використовуйте app ID або посилання на магазин',
  'sub {} is a package, use its app ID':
    'sub {} — це пакет, використайте його app ID',
  'add a game': 'додайте гру',
  'add a game or a status': 'додайте гру або статус',
  'the status is over 64 characters': 'статус довший за 64 символи',
  'Steam plays at most 32 games at once, the status counts as one':
    'Steam запускає щонайбільше 32 ігри одночасно, статус рахується як одна',
  'Steam plays at most {} games at once':
    'Steam запускає щонайбільше {} ігор одночасно',
  'Steam takes about {} free games an hour, add fewer':
    'Steam приймає близько {} безкоштовних ігор на годину, додайте менше',
  'sales reward at most {} queues a day':
    'розпродажі нагороджують щонайбільше за {} черги на день',
  'All clear': 'Усе гаразд',
  'Web API key for {}': 'ключ Web API для {}',
  'VAC banned': 'бан VAC',
  'game banned': 'ігровий бан',
  'trade banned': 'бан на трейди',
  'on trade probation': 'випробувальний термін на трейди',
  'market restricted': 'обмеження маркету',
  limited: 'обмежений акаунт',
  'Accepted 1 gift': 'Прийнято 1 подарунок',
  'Accepted {} gifts': 'Прийнято подарунків: {}',
  'No gifts waiting': 'Подарунків немає',
  '{} failed: {}': 'помилок: {}, перша: {}',
  'Changed {}': 'Змінено {}',
  'nickname to {}': 'нікнейм на {}',
  privacy: 'приватність',
  avatar: 'аватар',
  'Nothing to move': 'Нічого переносити',
  'Moved {}': 'Перенесено: {}',
  '1 item': '1 предмет',
  '{} items': '{} шт.',
  "Sent {}, but the storage account didn't take them: {}":
    'Надіслано {}, але акаунт-сховище їх не прийняв: {}',
  'viewed {} games in the discovery queue':
    'переглянуто ігор у черзі відкриттів: {}',
  'the discovery queue was empty': 'черга відкриттів порожня',
  'claimed the free sale item': 'отримано безкоштовний предмет розпродажу',
  'sale item already claimed, next in {} h':
    'предмет розпродажу вже отримано, наступний за {} год',
  'no sale item to claim': 'предмета розпродажу немає',
  'Playing 1 game': 'Грає в 1 гру',
  'Playing {} games': 'Ігор запущено: {}',
  Offline: 'Не в мережі',
  "Wasn't playing": 'Не грав',
  '1 game with {} card drops left': '1 гра, карток залишилося: {}',
  '{} games with {} card drops left': 'ігор: {}, карток залишилося: {}',
  'No card drops left': 'Карток не залишилося',
  'Steam took too long to answer, still trying':
    'Steam надто довго не відповідає, пробуємо далі',
  stopped: 'зупинено',
  'the browser tab is closed': 'вкладку браузера закрито',
  "could not start the tab's proxy": 'не вдалося запустити проксі вкладки',
  'not a web address': 'не схоже на веб-адресу',
  'there are already {} bookmarks, remove one first':
    'закладок уже {}, спершу приберіть одну',
  "the page hasn't loaded yet": 'сторінка ще не завантажилася',
}
