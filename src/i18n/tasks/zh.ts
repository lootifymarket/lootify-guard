import type { tasks as en } from './en.ts'

export const tasks: typeof en = {
  title: '任务',
  subtitle: '先选择任务，再选择要运行的账户',
  allAccounts: '所有账户',
  noGroup: '未分组',
  kinds: {
    hourBoost: {
      name: '挂时长',
      text: '在保持在线的连接上运行游戏',
    },
    cardFarming: {
      name: '挂卡',
      text: '运行仍会掉卡的游戏，直到卡牌掉完',
    },
    moveToStorage: {
      name: '转移到仓库',
      text: '把所有可交易物品转到一个账户',
    },
    acceptGifts: {
      name: '接受礼物',
      text: '账户无需付出任何物品的收到的报价',
    },
    profile: {
      name: '个人资料',
      text: '昵称、简介、头像和隐私',
    },
    freeGames: {
      name: '免费游戏',
      text: '通过商店链接或 ID 领取免费许可',
    },
    events: {
      name: '活动',
      text: '探索队列和免费促销物品',
    },
    joinGroups: {
      name: '加入群组',
      text: '每次从你的列表中加入几个群组',
    },
    wishlist: {
      name: '愿望单',
      text: '每次从大列表中加入几款游戏',
    },
    warmUp: {
      name: '预热计划',
      text: '在几天内完成资料、群组和愿望单',
    },
    check: {
      name: '检查',
      text: '会话、个人资料、Web API 密钥、封禁和限制',
    },
    goOffline: {
      name: '下线',
      text: '停止游戏并断开游戏连接',
    },
  },
  moveTo: (storage) => `转移到 ${storage}`,

  imageTooBig: '图片超过 1 MB',

  to: '转到',
  pickAccount: '选择账户',
  game: '游戏',
  moveNote: '每个账户发出包含全部可交易物品的报价，由仓库账户接受。无需手机。',

  games: '游戏',
  ownList: '各账户自己的列表',
  boostNote:
    '应用 ID 或商店链接，最多 32 个。留空时，各账户运行其“游戏”标签页中的游戏。账户会一直运行到执行“下线”，断线后会自动重连。',

  discoveryQueues: '探索队列',
  queues: (n) => (n === 0 ? '无' : `${n} 个队列`),
  claimItem: '领取免费促销物品',
  eventsNote:
    'Steam 促销和节日期间，浏览队列可获得集换式卡牌，免费物品通常是贴纸之类。没有促销时则没有可领取的内容。',

  freeGamesNote:
    '商店链接，或 app/…、sub/… 形式的 ID，用空格或逗号分隔。纯数字视为应用 ID。已拥有的游戏会跳过。',

  onlyOwn: '只接受我的账户',

  groupLinks: '群组',
  groupsPlaceholder: 'steamcommunity.com/groups/…，每行一个',
  eachRun: '每次运行',
  groupsPerRun: { 1: '1 个群组', 2: '1–2 个群组', 3: '1–3 个群组' },
  joinNote:
    '每个账户随机加入列表中尚未加入的这么多个群组。只接受申请或邀请的群组会被跳过。大约每天运行一次。',
  wishGames: '游戏',
  wishSources: { popular: '热门游戏，内置列表', mine: '我的列表' },
  myGames: '我的游戏',
  myGamesPlaceholder: '应用 ID 或商店链接',
  wishSizes: {
    small: '2–4 款游戏',
    medium: '3–8 款游戏',
    large: '5–12 款游戏',
  },
  wishNote: '每个账户得到自己的一组游戏。已拥有或已在愿望单中的会被跳过。',

  atOnce: '同时进行',
  oneByOne: '逐个进行',
  accountsAtOnce: (n) => `${n} 个账户`,
  pause: '账户之间的暂停',
  noPause: '无',
  seconds: (min, max) => `${min}–${max} 秒`,
  retry: '失败时重试，最多 3 次',
  retryLabel: '重试失败的账户',
  runOn: (target, n) => `在 ${target} 上运行（${n}）`,
  sections: {
    playing: '游戏',
    profile: '资料与活跃',
    items: '物品与交易',
    store: '商店与活动',
    checks: '检查',
  },
  running: '运行中',
  accounts: '账户',
  pickAccounts: '选择账户…',
  pickedAccounts: '已选账户',
  accountCount: (n: number) => `${n} 个账户`,
  selected: (n: number, total: number) => `已选 ${n} / ${total}`,
  search: '搜索账户',
  pickAll: '全选',
  pickNone: '全不选',
  noMatches: '没有匹配的账户。',
  runOnPicked: (n: number) => `在 ${n} 个账户上运行`,
  started: (task, target) => `已在 ${target} 上启动「${task}」`,

  profile: {
    nickname: '昵称',
    random: '随机',
    randomHint: '为每个账户生成不同的随机昵称',
    keepAsIs: '保持不变',
    templateNote:
      '{n} 会替换为账户在分组中的序号：farm {n} 变成 farm 1、farm 2… {random} 会为每个账户生成不同的随机昵称。',
    privacy: {
      profile: '个人资料',
      inventory: '库存',
      games: '游戏',
    },
    keep: '不变',
    avatarKeep: '头像：不变',
    remove: '移除',
    chooseImage: '选择图片',
    description: '简介',
    descriptionModes: {
      keep: '保持不变',
      generate: '自动生成',
      lines: '使用我的文本',
    },
    piecesLabel: '组成部分',
    pieces: {
      greeting: '问候',
      about: '自我介绍',
      games: '游戏',
      status: '状态',
      quote: '名言',
      tradeNote: '交易说明',
      ascii: 'ASCII 图案',
      kaomoji: '颜文字',
      divider: '分隔线',
    },
    language: '语言',
    languages: {
      mixed: '英语和俄语',
      english: '英语',
      russian: '俄语',
    },
    length: '长度',
    lengths: {
      short: '短，1–2 部分',
      medium: '中，3–4 部分',
      long: '长，5–7 部分',
    },
    examples: '示例',
    shuffle: '换一批',
    generateNote:
      '每个账户都会得到自己的文本：各部分顺序随机，每部分也有各自的选项。同一任务中不会有两个相同的简介。',
    myLines: '我的文本',
    linesPlaceholder: '{hey|yo}, just a {CS2|Rust} player from {country}',
    linesNote:
      '每行一个简介。{a|b|c} 从选项中选一个，{country} 为随机国家，{n} 为账户在任务中的序号。每个账户随机分到一行。',
  },

  plan: {
    steps: {
      description: {
        name: '简介',
        hint: '每个账户都有自己的文本，生成方式与“个人资料”任务相同',
      },
      groups: { name: '加入群组', hint: '每天从下方列表中加入一个群组' },
      wishlist: { name: '愿望单', hint: '每次加入几款游戏，数量见下方设置' },
      queue: { name: '探索队列', hint: '浏览一次队列，就像平常逛商店' },
    },
    over: '持续',
    days: (n: number) => `${n} 天`,
    from: '从',
    to: '到',
    note: '每个账户每天按自己的顺序做一步，时间在这些小时之间随机。应用打开时（包括在托盘中）步骤才会运行。应用关闭的日子会被跳过，计划只是顺延结束，不会一天做两步。保险库锁定时计划会等待，除非开启了“设置 › 锁定时继续运行任务”。',
    started: (target: string) => `已在 ${target} 上启动预热计划`,
    startOn: (target: string, n: number) => `在 ${target} 上启动计划（${n}）`,
    startOnPicked: (n: number) => `在 ${n} 个账户上启动计划`,
  },
  queue: {
    dayOf: (day: number, days: number) => `第 ${day} / ${days} 天`,
    today: (done: number, total: number) => `今天 ${done} / ${total}`,
    nextSoon: '马上进行下一步',
    nextInMinutes: (n: number) => `约 ${n} 分钟后下一步`,
    nextInHours: (n: number) => `约 ${n} 小时后下一步`,
    nextAt: (time: string) => `下一步 ${time}`,
    stopPlan: '停止计划',
    planStopped: '计划已停止',
    title: '队列',
    clearFinished: '清除已完成',
    empty: '还没有运行过任务。',
    running: '运行中',
    stopped: '已停止',
    done: '完成',
    toLookAt: (n) => `${n} 个需要查看`,
    error: '出错',
    of: (done, total) => `${done} / ${total}`,
    stoppedToast: '任务已停止',
    close: '关闭',
    ok: '确定',
    stop: '停止',
    waitingRetry: (tries) => `等待重试（已尝试 ${tries} 次，共 3 次）`,
    waiting: '等待中',
    runningAccount: '运行中…',
    skipped: '已跳过',
  },
}
