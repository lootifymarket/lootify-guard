import type { accounts as en } from './en.ts'

export const accounts: typeof en = {
  title: '账户',
  emptyTitle: '还没有账户',
  emptyText:
    '登录以添加账户并在这里设置 Steam 令牌，或导入来自 Steam Desktop Authenticator、ASF 或 steamguard-cli 的 .maFile 文件。它们的密钥只保存在这个保险库中。',
  add: '添加账户',
  search: '搜索账户',
  searchPlaceholder: '登录名或 Steam ID',
  groups: '分组',
  all: '全部',
  noGroup: '未分组',
  newGroup: '+ 新建分组',
  editGroup: (name) => `编辑“${name}”`,
  playing: '游戏中',
  view: '查看',
  viewAccount: (name) => `查看 ${name}`,
  nothingFound: '没有找到结果。',
  copy: '复制',
  refreshesIn: (seconds) => `${seconds} 秒后刷新`,
  importButton: '导入 .maFile',
  importTitle: '导入 .maFile',
  done: '完成',
  added: (n) => `已添加 ${n} 个账户。`,
  noneAdded: '没有添加新账户。',
  fileAdded: '已添加',
  fileAlreadyAdded: '之前已添加',
}
