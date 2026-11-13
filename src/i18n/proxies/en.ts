export const proxies = {
  title: 'Proxies',
  summary: (proxies: number, accounts: number) =>
    `${proxies} ${proxies === 1 ? 'proxy' : 'proxies'} · ${accounts} ${accounts === 1 ? 'account' : 'accounts'} on them`,
  checking: 'Checking…',
  checkAll: 'Check all',
  add: 'Add',
  list: 'Proxy list',
  columns: {
    proxy: 'Proxy',
    type: 'Type',
    country: 'Country',
    ping: 'Ping',
    accounts: 'Accounts',
    status: 'Status',
  },
  empty: 'No proxies yet. Add one, or paste a list on the right.',
  ms: (ms: number) => `${ms} ms`,
  notChecked: 'Not checked',
  working: 'Working',
  notResponding: 'Not responding',
  notRespondingCount: (n: number) => `${n} not responding`,
  allWorking: 'all working',
  checked: (n: number) => `Checked ${n} ${n === 1 ? 'proxy' : 'proxies'}`,
  checkComplete: 'Check complete',
  added: 'Proxy added',
  deleted: 'Proxy deleted',

  details: {
    withLogin: ' · with login',
    noAccounts: 'No accounts use this proxy.',
    deleteWarning: (n: number): string =>
      n === 1
        ? 'If you delete it, this account can’t reach Steam until you give it another proxy. Nothing goes out from your own IP instead.'
        : 'If you delete it, these accounts can’t reach Steam until you give them another proxy. Nothing goes out from your own IP instead.',
    close: 'Close',
    delete: 'Delete proxy',
    check: 'Check',
  },

  bulk: {
    title: 'Bulk import',
    import: 'Import',
    importLines: (n: number) => `Import ${n}`,
    added: (n: number) => `Added ${n}`,
    alreadyAdded: (n: number) => `${n} already in the list`,
    line: (line: number, reason: string) => `Line ${line}: ${reason}`,
  },

  form: {
    title: 'Add proxy',
    alreadyAdded: 'This proxy is already in the list',
    link: 'Link',
    linkHint: 'Paste a full link to fill in the fields below, or type them in.',
    name: 'Name',
    namePlaceholder: 'Optional, shown instead of the address',
    type: 'Type',
    host: 'Host',
    port: 'Port',
    login: 'Login',
    password: 'Password',
    test: 'Test connection',
    connected: (ms: number) => `Connected · ${ms} ms`,
    add: 'Add',
  },
}
