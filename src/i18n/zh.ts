import type { Dictionary } from './en.ts'
import { accounts } from './accounts/zh.ts'
import { guard } from './guard/zh.ts'
import { account } from './account/zh.ts'
import { addAccount } from './addAccount/zh.ts'
import { groups } from './groups/zh.ts'
import { trades } from './trades/zh.ts'
import { inventory } from './inventory/zh.ts'
import { tasks } from './tasks/zh.ts'
import { proxies } from './proxies/zh.ts'

export const zh: Dictionary = {
  accounts,
  guard,
  account,
  addAccount,
  groups,
  trades,
  inventory,
  tasks,
  proxies,

  common: {
    back: '返回',
    cancel: '取消',
    save: '保存',
    continue: '继续',
    change: '更改',
    export: '导出',
    copied: '已复制',
    copyFailed: '复制失败',
  },

  errors: {
    wrongPassword: '密码错误',
    locked: '保险库已锁定',
    biometricsOutdated: '生物识别解锁已与此保险库不匹配，请使用密码。',
    cancelled: '已取消',
  },

  time: {
    justNow: '刚刚',
    minutes: (n) => `${n} 分钟`,
    hours: (n) => `${n} 小时`,
    days: (n) => `${n} 天`,
  },

  onboarding: {
    steps: ['欢迎', '主密码', '偏好设置'],
    promises: [
      {
        title: '数据留在你的电脑上',
        text: '没有云端。密钥在本地加密，绝不离开这台设备。',
      },
      {
        title: '开源',
        text: '每一行代码都公开在 GitHub 上，任何人都能查看它做了什么。',
      },
      {
        title: '为交易者和农场打造',
        text: '令牌代码、确认、交易、代理和批量任务。',
      },
    ],
    asideNote:
      '所有数据都保存在这台电脑上，并用你的主密码加密。Lootify 永远不会收到你的密码或 Steam 令牌密钥。',
    welcomeTitle: '欢迎使用 Lootify Guard',
    welcomeLead:
      'Steam 令牌代码、交易确认和你所有的 Steam 账户，都在这台电脑上的一个加密保险库里。',
    getStarted: '开始',
    createTitle: '创建主密码',
    createLead:
      '它用于加密保险库，每次打开应用时都需要输入。没有它谁也无法读取你的保险库，包括我们。',
    masterPassword: '主密码',
    repeatPassword: '再次输入密码',
    passphraseHint: '使用较长的密码短语，四个或更多随机单词效果很好。',
    weak: '弱密码',
    good: '良好的密码',
    strong: '强密码',
    mismatch: '两次输入的密码不一致',
    recommended: '建议',
    rules: {
      length: '至少 12 个字符',
      lengthMissing: '少于 12 个字符',
      numberOrSymbol: '包含数字或符号',
      numberOrSymbolMissing: '没有数字或符号',
      mixedCase: '包含大小写字母',
      mixedCaseMissing: '没有同时使用大小写字母',
    },
    unlockWith: (name) => `使用 ${name} 解锁`,
    unlockWithText: '如果忘记密码，还可以在这台电脑上设置新密码。',
    biometricFailed: (name, error) =>
      `保险库已就绪，但无法开启 ${name}：${error}`,
    creating: '正在创建保险库…',
    create: '创建保险库',
    weakTitle: '这个密码很容易被猜到',
    weakText:
      '如果恶意软件复制了你的保险库文件，弱密码可能在几小时内被离线破解，里面所有的 Steam 令牌密钥都会泄露。长密码短语则需要数年。',
    useAnyway: '仍然使用',
    makeStronger: '加强密码',
    prefsTitle: '一些偏好设置',
    prefsLead: '这些稍后都可以在设置中更改。',
  },

  unlock: {
    footnote: '你的数据已加密，只保存在这台设备上。',
    enterPassword: '请输入密码',
    decrypting: '正在解密保险库…',
    prompt: '输入主密码以打开保险库。',
    masterPassword: '主密码',
    opening: '正在打开…',
    unlock: '解锁',
    unlockWith: (name) => `使用 ${name} 解锁`,
    forgot: '忘记密码？',
    recoverTitle: '重置密码',
    recoverText: (name) =>
      `此保险库已开启 ${name}。请先确认是你本人，然后设置新的主密码。`,
    verifiedWith: (name) => `已通过 ${name} 验证`,
    newPassword: '新主密码',
    repeatPassword: '再次输入密码',
    recommended: '建议 12 个字符以上',
    mismatch: '两次输入的密码不一致',
    weak: '弱：如果保险库文件被盗，很容易被破解',
    looksGood: '可以',
    repeat: '请再次输入密码',
    reencrypting: '正在重新加密保险库…',
    saveAndUnlock: '保存并解锁',
    waitingFor: (name) => `正在等待 ${name}…`,
    verifyWith: (name) => `通过 ${name} 验证`,
    unavailable: (name) => `${name} 不可用`,
    resetTitle: '无法打开保险库',
    resetText: (name) =>
      `没有密码${name ? `或 ${name}` : ''}，谁也无法解密，包括我们。这正是加密的意义。清除它并重新开始，你的 Steam 账户不会丢失。`,
    waysTitle: '重置后如何找回账户',
    ways: [
      {
        title: '从备份恢复',
        text: '导入你的 .maFile 文件，或在设置中制作的保险库备份。',
      },
      {
        title: '使用 Steam 撤销码',
        text: '每个 R 码可以移除对应账户的 Steam 令牌，然后重新添加该账户。',
      },
      {
        title: '联系 Steam 客服',
        text: '适用于既没有备份也没有 R 码的账户。',
      },
    ],
    resetWord: 'RESET',
    typeReset: '输入 RESET 以清除此保险库',
    erasing: '正在清除…',
    erase: '清除保险库并重新开始',
    remembered: '← 我想起来了',
  },

  splash: {
    steps: ['正在检查完整性', '正在加载设置', '完成'],
    by: 'Lootify Market 出品',
  },

  sidebar: {
    menu: '主菜单',
    accounts: '账户',
    guard: 'Steam 令牌',
    trades: '交易',
    inventory: '库存',
    tasks: '任务',
    proxies: '代理',
    add: '添加账户',
    settings: '设置',
    vaultUnlocked: '保险库已解锁',
    locksIn: (minutes) => `${minutes} 分钟后锁定`,
    lock: '锁定',
    streamerOn: '主播模式已开启',
    streamerOff: '关闭主播模式',
    version: (version) => `v${version} · 开源`,
  },

  settings: {
    title: '设置',
    display: '显示',
    language: '语言',
    streamer: '主播模式',
    streamerHint: '隐藏余额、价格、Steam 令牌代码、SteamID 和交易链接。',
    security: '安全',
    autoLock: '自动锁定',
    autoLockHint: '无操作超过这段时间后锁定保险库。自动确认只在解锁时运行。',
    minutes: (n) => (n === 60 ? '1 小时' : `${n} 分钟`),
    never: '从不',
    unlockWith: (name) => `使用 ${name} 解锁`,
    biometricHint: (name) =>
      `保险库密钥保存在登录钥匙串中，应用使用前会要求 ${name}。`,
    masterPassword: '主密码',
    backup: '备份',
    backupNever: '尚未保存。',
    backupJustNow: '刚刚保存。',
    backupAgo: (when) => `上次保存于 ${when}前。`,
    backupHint: '文件包含所有账户和令牌密钥，并用主密码加密。',
    backupSaved: '备份已保存',
    app: '应用',
    startup: '开机启动',
    startupHint: '启动后在托盘中运行，保险库保持锁定。',
    tray: '在托盘中保持运行',
    trayHint:
      '关闭窗口后，自动确认、挂游戏和挂卡会继续运行。可通过托盘图标退出。',
    passwordChanged: '主密码已更改',
  },

  changePassword: {
    title: '更改主密码',
    current: '当前密码',
    new: '新密码',
    repeat: '再次输入新密码',
    mismatch: '两次输入的密码不一致',
    weak: '弱：请使用 12 个字符以上，包含大小写字母和数字或符号',
    movesBiometric: (name) => `保险库将重新加密，${name} 会转到新密码。`,
    reencrypted: '保险库将用新密码重新加密。',
    wrongCurrent: '当前密码错误',
    reencrypting: '正在重新加密…',
  },
}
