import type { guard as en } from './en.ts'

export const guard: typeof en = {
  title: 'Steam 令牌',
  seconds: (n) => `${n} 秒`,
  codes: '代码',
  findAccount: '查找账户',
  clickToCopy: '点击复制',
  hiddenClickToCopy: '已隐藏 · 点击复制',
  noAccounts: '还没有账户。请在“账户”页面导入 .maFile 文件。',
  nothingFound: '没有找到结果。',
  refresh: '刷新',

  confirmations: {
    title: '确认',
    refresh: '刷新确认',
    confirmAll: '全部确认',
    signInFirst: '在账户页面登录该账户后，它的确认会显示在这里。',
    nothing: '没有需要确认的内容。',
    confirm: '确认',
    decline: '拒绝',
    refreshed: '确认列表已刷新',
    confirmed: '已确认',
    declined: '已拒绝',
    confirmedCount: (n) => `已确认：${n}`,
    confirmAllTitle: '全部确认？',
    confirmAllText: (operations, accounts) =>
      `将确认 ${accounts} 个账户上的 ${operations} 项操作。如果不确定它们是什么，请先查看。`,
    kinds: {
      trade: '交易',
      marketListing: '市场',
      apiKey: 'API 密钥',
      other: '其他',
    },
  },

  signIns: {
    title: '登录请求',
    refresh: '刷新登录请求',
    qr: '二维码登录',
    allowed: (name) => `已允许 ${name} 的登录。`,
    unknownLocation: '位置未知',
    unfamiliar: 'Steam 以前没见过从这里登录',
    notMe: '不是我',
    allow: '允许',
    noRequests: '没有新的请求。',
    blockedTitle: '已阻止登录',
    blockedText: (name) =>
      `有人知道 ${name} 的密码。请立即在 Steam 中更改密码，并在那里退出所有其他会话。`,
    gotIt: '知道了',
    platforms: {
      steamClient: 'Steam 客户端',
      webBrowser: '浏览器',
      mobileApp: 'Steam 手机应用',
      unknown: '未知设备',
    },
  },

  autoConfirm: {
    title: '自动确认',
    states: { running: '运行中', paused: '已暂停', off: '已关闭' },
    resume: '继续',
    pause: '暂停',
    rules: '规则',
    onFor: (on, total, names) =>
      `已为 ${total} 个账户中的 ${on} 个开启：${names}`,
    offForAll: '所有账户均已关闭。请在“规则”中选择要确认的内容。',
    pausedNote: '已暂停。在你继续之前，不会自动确认任何内容。',
    pausedToast: '自动确认已暂停',
    resumedToast: '自动确认已恢复',
    confirmedLog: '已自动确认',
    nothingYet: '自保险库解锁以来，还没有自动确认任何内容。',
    footnote:
      '保险库解锁期间每分钟检查一次。此列表只保存在内存中，保险库锁定时清空。',
  },

  rulesDialog: {
    title: '自动确认规则',
    group: '分组',
    never: 'API 密钥、更换手机和账户恢复永远不会被自动确认。',
    done: '完成',
    applyNow: '更改立即生效。每个账户的页面上也有相同的开关。',
    account: '账户',
    all: (n) => `全部 ${n} 个`,
    forEvery: (rule) => `为所有账户开启“${rule}”`,
    toggledForAll: (rule, on, n) =>
      `已为 ${n} 个账户${on ? '开启' : '关闭'}“${rule}”`,
    notSignedIn: '未登录',
    risky: (names) =>
      `已为 ${names} 开启“任意市场上架”。任何进入这些 Steam 会话的人发布的上架也会被确认。`,
  },

  rules: {
    tradesToOwnAccounts: {
      label: '交易到我的账户',
      short: '到我的账户',
      hint: '物品转到此保险库中的另一个账户。对方是谁会向 Steam 查询，而不是相信报价中的文字。',
    },
    anyMarketListing: {
      label: '任意市场上架',
      short: '任意上架',
      hint: 'Steam 市场上的每一次上架，无论是在这里还是在其他地方发布的。',
      warning: '任何进入此 Steam 会话的人发布的上架也会被确认。',
    },
  },

  qr: {
    title: '使用二维码登录',
    notSteam: '这个二维码不是来自 Steam 登录页面。',
    intro: '用摄像头扫描 Steam 登录页面上的二维码，或粘贴其中的链接。',
    scan: '用摄像头扫描',
    link: '链接',
    account: '账户',
    allow: '允许登录',
  },

  scanner: {
    camera: '摄像头',
    cameraNumber: (n) => `摄像头 ${n}`,
    hint: '将二维码对准摄像头。在 Mac 上，附近的 iPhone 也可以选作摄像头。',
    cameraOff: '摄像头权限已关闭。请在系统隐私设置中为 Lootify Guard 开启。',
    noCamera: '未找到摄像头。',
    cameraFailed: '无法启动摄像头。',
  },
}
