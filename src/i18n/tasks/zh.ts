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

  queue: {
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
