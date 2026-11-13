import type { addAccount as en } from './en.ts'

export const addAccount: typeof en = {
  steps: ['登录', 'Steam 令牌', '撤销码'],

  signInTitle: '登录 Steam',
  login: '用户名',
  password: '密码',
  proxy: '代理',
  noProxy: '不使用代理',
  savePassword: '保存密码，而不仅是会话',
  savePasswordLabel: '保存密码',
  wrongLogin: 'Steam 提示用户名或密码错误',
  signingIn: '正在登录…',
  signIn: '登录',

  guardTitle: 'Steam 令牌',
  guardOnPhone: (name) => `${name} 的 Steam 令牌在手机上。`,
  noAuthenticator: (name) => `${name} 没有手机验证器。`,
  method: '方式',
  methods: {
    new: {
      name: '添加新的验证器',
      text: '在这里创建，并用 Steam 通过短信或邮件发送的代码确认。',
      unavailable:
        'Steam 令牌已在手机上。请改为转移，或在账户列表中导入它的 .maFile。',
    },
    move: {
      name: '从手机转移',
      text: '通过 Steam 官方转移，短信确认。手机上的令牌将停止工作。',
      unavailable: '此账户的手机上没有可转移的 Steam 令牌。',
    },
  },
  tradeHold: '添加令牌后的前 7 天内，交易会被暂挂。这是 Steam 的规则。',
  askingSteam: '正在请求 Steam…',

  revocationTitle: '撤销码',
  revocationLead: (name) =>
    `如果保险库丢失，这是从 ${name} 移除 Steam 令牌的唯一方法。请在这台电脑之外保存一份。`,
  copy: '复制',
  saveTxt: '保存为 .txt',
  savedAs: (file) => `已保存为 ${file}`,
  stored: '我已把代码保存在安全的地方',
  noRevocation: (name) => `${name} 已添加，但 Steam 没有给出撤销码。`,
  done: '完成',

  guardCode: 'Steam 令牌代码',
  emailCode: '邮件验证码',
  moveFromPhone: '从手机转移',
  confirmationCode: '确认码',
  code: '代码',
  checking: '正在验证…',
  confirm: '确认',
  signInPhoneText: '输入该账户手机上 Steam 应用中令牌显示的代码。',
  signInEmailText: 'Steam 已向该账户的邮箱发送了代码。',
  guardEmailText: 'Steam 已向该账户的邮箱发送了代码。输入它以启用新的验证器。',
  phoneEnding: (digits) => `尾号为 ${digits} 的手机`,
  accountPhone: '该账户的手机号',
  smsMove: (phone) =>
    `Steam 已向${phone}发送短信。输入代码后，手机上的令牌将停止工作。`,
  smsNew: (phone) => `Steam 已向${phone}发送短信。输入代码以启用新的验证器。`,
  guardAdded: '已添加 Steam 令牌',
}
