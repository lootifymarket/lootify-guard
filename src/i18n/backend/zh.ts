import type { BackendMessage } from './en.ts'

export const backend: Record<BackendMessage, string> = {
  // Steam
  'wrong login or password': '登录名或密码错误',
  'too many sign-in attempts, try again later': '登录尝试次数过多，请稍后再试',
  "Steam wants a confirmation this app can't give, such as an email code":
    'Steam 要求本应用无法提供的确认，例如邮箱验证码',
  'wrong code, check it and try again': '验证码错误，请检查后重试',
  'Steam wants a phone number on the account first':
    'Steam 要求账户先绑定手机号码',
  'open the link in the email Steam sent, then try again':
    '请打开 Steam 发送的邮件中的链接，然后重试',
  'the account already has Steam Guard on another device':
    '该账户已在其他设备上启用 Steam 令牌',
  'the Steam session has ended, sign in again': 'Steam 会话已结束，请重新登录',
  'not a link from a Steam sign-in QR code': '这不是 Steam 登录二维码中的链接',
  "couldn't reach Steam, check the connection": '无法连接 Steam，请检查网络',
  'Steam took too long to answer, try again': 'Steam 响应超时，请重试',
  "Steam's servers are busy, try again in a minute":
    'Steam 服务器繁忙，请一分钟后重试',
  'Steam is getting too many requests from this address, wait a few minutes':
    '此地址向 Steam 发送的请求过多，请等待几分钟',
  "couldn't reach Steam through the proxy": '无法通过代理连接 Steam',
  "Steam rejected the Guard code; this account's authenticator may have been removed or moved":
    'Steam 拒绝了令牌代码，该账户的验证器可能已被移除或转移',
  'Steam said: {}': 'Steam 返回：{}',
  'Steam answered with something unexpected ({})': 'Steam 返回了意外内容（{}）',
  'it kept redirecting': '页面不断重定向',
  'it kept redirecting to {}': '页面不断重定向到 {}',
  'the answer was cut off': '响应被截断',
  'unexpected response': '意外的响应',
  'Steam refused, try again': 'Steam 拒绝了请求，请重试',
  'no session was issued': '未获得会话',
  'no profile in the answer': '响应中没有个人资料',
  'avatar too large': '头像过大',
  'unreadable answer': '无法读取响应',
  'unreadable profile': '无法读取个人资料',
  'unreadable session token': '无法读取会话令牌',
  'unreadable avatar digest': '无法读取头像摘要',
  'unreadable trade offer': '无法读取交易报价',
  'unreadable trade offers': '无法读取交易报价列表',
  'unreadable discovery queue': '无法读取探索队列',
  'unreadable sale item answer': '无法读取促销物品响应',
  'unreadable list of games': '无法读取游戏列表',
  'unreadable inventory': '无法读取库存',
  'unreadable store page': '无法读取商店页面',
  'unreadable item name': '无法读取物品名称',
  'unreadable wallet': '无法读取钱包',
  'unreadable trade token': '无法读取交易令牌',
  'unreadable message from Steam': '无法读取 Steam 消息',
  'unreadable server list': '无法读取服务器列表',
  'unreadable API key page': '无法读取 API 密钥页面',
  'unreadable device id': '无法读取设备 ID',
  'unreadable device list': '无法读取设备列表',
  'unreadable profile settings': '无法读取个人资料设置',
  'unreadable privacy settings': '无法读取隐私设置',
  'no {} on the page "{}"': '没有 {}（页面“{}”）',
  'item picture too large': '物品图片过大',
  'unknown item picture': '未知的物品图片',

  // Signing in, Guard and confirmations
  "Steam couldn't add an authenticator": 'Steam 无法添加验证器',
  "Steam didn't accept the new authenticator's codes":
    'Steam 不接受新验证器的代码',
  'Steam wants more codes': 'Steam 需要更多代码',
  'no identity secret': '没有身份密钥',
  'nothing to confirm': '没有需要确认的内容',
  'this sign-in has ended, start adding the account again':
    '此次登录已结束，请重新开始添加账户',
  'this sign-in request has expired': '此登录请求已过期',
  'this sign-in was already answered': '此登录请求已处理',
  'unknown sign-in request': '未知的登录请求',
  'the shared secret is damaged': '共享密钥已损坏',
  'damaged shared secret': '共享密钥已损坏',
  'shared secret is not valid base64': '共享密钥不是有效的 base64',
  'Steam turned down the client sign-in': 'Steam 拒绝了客户端登录',
  'no client sign-in was issued': '未获得客户端登录',
  'the client sign-in failed (code {})': '客户端登录失败（代码 {}）',
  'Steam signed the connection out (code {})': 'Steam 断开了此连接（代码 {}）',

  // The vault and the computer
  'the account is no longer in the vault': '该账户已不在保险库中',
  'this account is already in the vault': '该账户已在保险库中',
  'this account has no revocation code': '该账户没有撤销码',
  'the system clock is set before 1970': '系统时间早于 1970 年',
  "the vault couldn't be read": '无法读取保险库',
  'waiting for the vault to be unlocked': '正在等待保险库解锁',
  'not a Lootify Guard vault': '这不是 Lootify Guard 保险库',
  'a vault already exists at this path': '此路径已存在保险库',
  'wrong password or the vault is damaged': '密码错误或保险库已损坏',
  'vault format version {} is not supported': '不支持保险库格式版本 {}',
  'vault contents are damaged at line {}, column {}':
    '保险库内容在第 {} 行第 {} 列损坏',
  'key derivation failed: {}': '密钥派生失败：{}',
  "biometric unlock isn't available on this computer":
    '这台电脑不支持生物识别解锁',
  'no vault key is stored for biometric unlock':
    '没有为生物识别解锁保存保险库密钥',
  'Touch ID failed': 'Touch ID 验证失败',
  'keychain: {}': '钥匙串：{}',
  "couldn't change the startup item: {}": '无法更改启动项：{}',
  'pick 5, 15 or 60 minutes': '请选择 5、15 或 60 分钟',
  cancelled: '已取消',

  // .maFile import
  'not a .maFile (broken at line {}, column {})':
    '不是 .maFile（第 {} 行第 {} 列损坏）',
  'the file has no {}': '文件中没有 {}',
  'account name': '账户名',
  '{} in the file is damaged': '文件中的 {} 已损坏',
  'the file is too large to be a .maFile': '文件过大，不可能是 .maFile',
  'the file is encrypted by Steam Desktop Authenticator, turn off encryption in SDA first':
    '该文件已被 Steam Desktop Authenticator 加密，请先在 SDA 中关闭加密',

  // Profile, security, trades, market
  "the change wasn't saved": '更改未保存',
  "the avatar wasn't saved": '头像未保存',
  "the file isn't a JPEG, PNG or GIF": '文件不是 JPEG、PNG 或 GIF',
  'the image is over 1 MB': '图片超过 1 MB',
  "the image isn't a JPEG, PNG or GIF": '图片不是 JPEG、PNG 或 GIF',
  'Steam made no new trade URL': 'Steam 未生成新的交易链接',
  'no trade URL on the page': '页面上没有交易链接',
  'no wallet on the market page': '市场页面上没有钱包',
  'the account no longer has a Web API key': '该账户已没有 Web API 密钥',
  'the key is still there': '密钥仍然存在',
  'keep the name under {} characters': '名称请少于 {} 个字符',
  'keep the note under {} characters': '备注请少于 {} 个字符',
  "that is this app's own session": '这是本应用自己的会话',
  'unknown trade offer': '未知的交易报价',
  'unknown trade partner': '未知的交易对象',
  "that isn't a Steam trade URL": '这不是 Steam 交易链接',
  'pick at least one item': '请至少选择一件物品',
  "the item wasn't listed": '物品未上架',
  'the price is too low': '价格太低',
  "this account's wallet is in {}, not {}": '该账户的钱包货币是 {}，不是 {}',
  'another currency': '其他货币',

  // Proxies and groups
  'the proxy is no longer in the vault': '该代理已不在保险库中',
  "the account's proxy is no longer in the vault": '该账户的代理已不在保险库中',
  'expected host:port, optionally with a login and password':
    '格式应为 host:port，可附带登录名和密码',
  'the port must be a number from 1 to 65535':
    '端口必须是 1 到 65535 之间的数字',
  'unknown proxy type, use http:// or socks5://':
    '未知的代理类型，请使用 http:// 或 socks5://',
  'give the group a name': '请为分组命名',
  "there's already a group with that name": '已有同名分组',
  'the group is no longer in the vault': '该分组已不在保险库中',

  // Free games
  "the license wasn't added": '许可未添加',
  'the store has no such app': '商店中没有此应用',
  "it isn't free in the store": '它在商店中不是免费的',
  "it isn't a free package": '这不是免费礼包',
  "not available in this account's region": '在该账户所在地区不可用',
  "it needs a game the account doesn't own": '需要该账户未拥有的游戏',
  'too many licenses lately, try again in an hour':
    '近期领取的许可过多，请一小时后再试',
  'purchase error {}': '购买错误 {}',
  'app {}: {}': 'app {}：{}',
  'sub {}: {}': 'sub {}：{}',
  'Added {}': '已添加 {} 个',
  '{} already owned': '{} 个已拥有',

  // Starting a task
  'pick at least one account': '请至少选择一个账户',
  'pick something to change': '请选择要更改的内容',
  'pick something to do': '请选择要执行的操作',
  'the nickname would be over 32 characters': '昵称将超过 32 个字符',
  'can\'t read "{}": use store links, app/440 or sub/12345':
    '无法识别“{}”：请使用商店链接、app/440 或 sub/12345',
  'can\'t read "{}": use app IDs or store links':
    '无法识别“{}”：请使用 app ID 或商店链接',
  'sub {} is a package, use its app ID': 'sub {} 是礼包，请使用其 app ID',
  'add a game': '请添加游戏',
  'add a game or a status': '请添加游戏或状态',
  'the status is over 64 characters': '状态超过 64 个字符',
  'Steam plays at most 32 games at once, the status counts as one':
    'Steam 最多同时运行 32 个游戏，状态也算一个',
  'Steam plays at most {} games at once': 'Steam 最多同时运行 {} 个游戏',
  'Steam takes about {} free games an hour, add fewer':
    'Steam 每小时大约只接受 {} 个免费游戏，请减少数量',
  'sales reward at most {} queues a day': '促销每天最多奖励 {} 个队列',

  // How a task went
  'All clear': '一切正常',
  'Web API key for {}': '{} 的 Web API 密钥',
  'VAC banned': 'VAC 封禁',
  'game banned': '游戏封禁',
  'trade banned': '交易封禁',
  'on trade probation': '交易观察期',
  'market restricted': '市场受限',
  limited: '受限账户',
  'Accepted 1 gift': '已接受 1 个礼物',
  'Accepted {} gifts': '已接受 {} 个礼物',
  'No gifts waiting': '没有待接受的礼物',
  '{} failed: {}': '{} 个失败：{}',
  'Changed {}': '已更改{}',
  'nickname to {}': '昵称为 {}',
  privacy: '隐私设置',
  avatar: '头像',
  'Nothing to move': '没有可转移的物品',
  'Moved {}': '已转移 {}',
  '1 item': '1 件物品',
  '{} items': '{} 件物品',
  "Sent {}, but the storage account didn't take them: {}":
    '已发送 {}，但仓库账户未接收：{}',
  'viewed {} games in the discovery queue': '已浏览探索队列中的 {} 个游戏',
  'the discovery queue was empty': '探索队列为空',
  'claimed the free sale item': '已领取免费促销物品',
  'sale item already claimed, next in {} h':
    '促销物品已领取，{} 小时后可再次领取',
  'no sale item to claim': '没有可领取的促销物品',
  'Playing 1 game': '正在运行 1 个游戏',
  'Playing {} games': '正在运行 {} 个游戏',
  Offline: '已下线',
  "Wasn't playing": '未在运行游戏',
  '1 game with {} card drops left': '1 个游戏，还剩 {} 张卡牌可掉落',
  '{} games with {} card drops left': '{} 个游戏，还剩 {} 张卡牌可掉落',
  'No card drops left': '没有剩余的卡牌掉落',
  'Steam took too long to answer, still trying': 'Steam 响应超时，仍在重试',
  stopped: '已停止',
  'the browser tab is closed': '浏览器标签页已关闭',
  "could not start the tab's proxy": '无法启动标签页的代理',
  'not a web address': '这不是网址',
  'there are already {} bookmarks, remove one first':
    '已有 {} 个书签，请先删除一个',
  "the page hasn't loaded yet": '页面尚未加载完成',
}
