import type { inventory as en } from './en.ts'

const items = (n: number) => `${n} 件物品`

export const inventory: typeof en = {
  title: '库存',
  shownItems: '物品',
  subtitle: '所有账户的所有物品都在这里。',
  items,
  account: '账户',
  allAccounts: '所有账户',
  group: '分组',
  game: '游戏',
  search: '搜索物品',
  sort: '排序',
  sorts: {
    rarity: '按稀有度，稀有的在前',
    name: '按名称 A–Z',
    account: '按账户',
  },
  tradableOnly: '仅可交易',
  selected: (n) => `已选 ${n} 件`,
  clearSelection: '取消选择',
  clickToSelect: '点击物品进行选择',
  selectAll: '全选',
  loadingMore: (n) => `还在加载 ${n} 个账户…`,
  moveToOne: '转移到一个账户',
  steamMarket: 'Steam 社区市场',
  notTradable: '暂时不可交易',
  noneSignedIn: '没有账户登录 Steam。',
  noItems: (game) => `这些账户没有 ${game} 物品。`,
  nothingFound: '未找到任何内容。',

  card: {
    pieces: (n) => `${n} 件`,
  },

  move: {
    title: '转移到一个账户',
    moveTo: '转移到',
    pickedHere: (n) => `此处已选 ${n} 件`,
    moved: '已转移',
    sentWaiting: (target, reason) =>
      `已发送，但 ${target} 暂时无法接收，交易报价在“交易”页面等待。（${reason}）`,
    done: '完成',
    allThere: (target) => `所选物品都已在 ${target} 上。`,
    plan: (count, from, target) =>
      `${items(count)}将从 ${from} 个账户转移到 ${target}。每个账户发送交易报价，令牌自动确认，${target} 自动接受，无需手机。`,
    staying: (n) => `另有 ${items(n)}已在该账户上，保持不动。`,
    moving: '正在转移…',
    movedTo: (count, target) => `已将 ${items(count)}转移到 ${target}`,
    move: (n) => `转移 ${items(n)}`,
  },

  market: {
    title: '上架到 Steam 社区市场',
    intro:
      '设置买家支付的价格。Steam 收取 5%，游戏收取 10%，令牌会立即确认上架。',
    skipped: (n) => `所选物品中有 ${items(n)}暂时无法上架，已跳过。`,
    noPrices: (reason) => `无法获取市场价格：${reason}`,
    asking: '正在查询市场…',
    lowest: (price) => `最低 ${price}`,
    median: (price) => `中位数 ${price}`,
    noPrice: '暂无市场价格',
    buyerPays: (name) => `买家为 ${name} 支付`,
    youGet: (money) => `你将获得 ${money}`,
    youGetTotal: (money) => `总计约获得 ${money}`,
    listing: '正在上架…',
    listedToast: (count) => `已上架 ${items(count)}`,
    list: (n) => `上架 ${items(n)}`,
    listed: '已上架',
    unconfirmed: '已上架，但在 Steam 令牌页面等待确认',
    needsEmail: '已上架，等待 Steam 发送的邮件确认',
    done: '完成',
  },
}
