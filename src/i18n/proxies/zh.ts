import type { proxies as en } from './en.ts'

export const proxies: typeof en = {
  title: '代理',
  summary: (proxies, accounts) =>
    `${proxies} 个代理 · ${accounts} 个账户在使用`,
  checking: '正在检查…',
  checkAll: '全部检查',
  add: '添加',
  list: '代理列表',
  columns: {
    proxy: '代理',
    type: '类型',
    country: '国家/地区',
    ping: '延迟',
    accounts: '账户',
    status: '状态',
  },
  empty: '还没有代理。添加一个，或在右侧粘贴列表。',
  ms: (ms) => `${ms} 毫秒`,
  notChecked: '未检查',
  working: '正常',
  notResponding: '无响应',
  notRespondingCount: (n) => `${n} 个无响应`,
  allWorking: '全部正常',
  checked: (n) => `已检查 ${n} 个代理`,
  checkComplete: '检查完成',
  added: '代理已添加',
  deleted: '代理已删除',

  details: {
    withLogin: ' · 带登录信息',
    noAccounts: '没有账户使用此代理。',
    deleteWarning: (n) =>
      n === 1
        ? '删除后，此账户将无法连接 Steam，直到你为它指定另一个代理。不会改用你自己的 IP 发送任何请求。'
        : '删除后，这些账户将无法连接 Steam，直到你为它们指定另一个代理。不会改用你自己的 IP 发送任何请求。',
    close: '关闭',
    delete: '删除代理',
    check: '检查',
  },

  bulk: {
    title: '批量导入',
    import: '导入',
    importLines: (n) => `导入 ${n} 个`,
    added: (n) => `已添加 ${n} 个`,
    alreadyAdded: (n) => `${n} 个已在列表中`,
    line: (line, reason) => `第 ${line} 行：${reason}`,
  },

  form: {
    title: '添加代理',
    alreadyAdded: '此代理已在列表中',
    link: '链接',
    linkHint: '粘贴完整链接即可自动填写下方字段，也可以手动填写。',
    name: '名称',
    namePlaceholder: '可选，代替地址显示',
    type: '类型',
    host: '主机',
    port: '端口',
    login: '登录名',
    password: '密码',
    test: '测试连接',
    connected: (ms) => `已连接 · ${ms} 毫秒`,
    add: '添加',
  },
}
