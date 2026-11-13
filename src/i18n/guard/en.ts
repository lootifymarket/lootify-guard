const count = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`

export const guard = {
  title: 'Steam Guard',
  seconds: (n: number) => `${n}s`,
  codes: 'Codes',
  findAccount: 'Find account',
  clickToCopy: 'Click to copy',
  hiddenClickToCopy: 'Hidden · click to copy',
  noAccounts: 'No accounts yet. Import .maFile files on the Accounts screen.',
  nothingFound: 'Nothing found.',
  refresh: 'Refresh',

  confirmations: {
    title: 'Confirmations',
    refresh: 'Refresh confirmations',
    confirmAll: 'Confirm all',
    signInFirst:
      'Sign in to an account on its page to see its confirmations here.',
    nothing: 'Nothing to confirm.',
    confirm: 'Confirm',
    decline: 'Decline',
    refreshed: 'Confirmations refreshed',
    confirmed: 'Confirmed',
    declined: 'Declined',
    confirmedCount: (n: number) => `Confirmed: ${n}`,
    confirmAllTitle: 'Confirm everything?',
    confirmAllText: (operations: number, accounts: number) =>
      `${count(operations, 'operation', 'operations')} on ${count(accounts, 'account', 'accounts')} will be confirmed. Review them first if you’re not sure what they are.`,
    kinds: {
      trade: 'Trade',
      marketListing: 'Market',
      apiKey: 'API key',
      other: 'Other',
    },
  },

  signIns: {
    title: 'Sign-in requests',
    refresh: 'Refresh sign-in requests',
    qr: 'QR sign-in',
    allowed: (name: string) => `Sign-in allowed for ${name}.`,
    unknownLocation: 'Unknown location',
    unfamiliar: 'Steam hasn’t seen a sign-in from here before',
    notMe: 'Not me',
    allow: 'Allow',
    noRequests: 'No new requests.',
    blockedTitle: 'Sign-in blocked',
    blockedText: (name: string) =>
      `Someone knows the password for ${name}. Change it in Steam now and sign out of all other sessions there.`,
    gotIt: 'Got it',
    platforms: {
      steamClient: 'Steam client',
      webBrowser: 'Browser',
      mobileApp: 'Steam mobile app',
      unknown: 'Unknown device',
    },
  },

  autoConfirm: {
    title: 'Auto-confirm',
    states: { running: 'Running', paused: 'Paused', off: 'Off' },
    resume: 'Resume',
    pause: 'Pause',
    rules: 'Rules',
    onFor: (on: number, total: number, names: string) =>
      `On for ${on} of ${count(total, 'account', 'accounts')}: ${names}`,
    offForAll: 'Off for every account. Choose what to confirm with Rules.',
    pausedNote: 'Paused. Nothing is confirmed automatically until you resume.',
    pausedToast: 'Auto-confirm paused',
    resumedToast: 'Auto-confirm resumed',
    confirmedLog: 'Confirmed automatically',
    nothingYet: 'Nothing confirmed automatically since the vault was unlocked.',
    footnote:
      'Checked every minute while the vault is unlocked. This list is kept in memory only and clears when the vault locks.',
  },

  rulesDialog: {
    title: 'Auto-confirm rules',
    group: 'Group',
    never:
      'API keys, phone changes and account recovery are never confirmed automatically.',
    done: 'Done',
    applyNow:
      'Changes apply right away. Each account’s page has the same switches.',
    account: 'Account',
    all: (n: number) => `All ${n}`,
    forEvery: (rule: string) => `${rule} for every account`,
    toggledForAll: (rule: string, on: boolean, n: number) =>
      `${rule}: ${on ? 'on' : 'off'} for ${count(n, 'account', 'accounts')}`,
    notSignedIn: 'Not signed in',
    risky: (names: string, n: number) =>
      `Any market listing is on for ${names}. Listings made by anyone who gets into ${n === 1 ? 'that Steam session' : 'those Steam sessions'} are confirmed too.`,
  },

  /** The auto-confirm rules, by their key. */
  rules: {
    tradesToOwnAccounts: {
      label: 'Trades to my accounts',
      short: 'To my accounts',
      hint: 'Items going to another account in this vault. Steam is asked who the other side is; the offer’s text isn’t trusted.',
    },
    anyMarketListing: {
      label: 'Any market listing',
      short: 'Any listing',
      hint: 'Every listing on the Steam market, made here or anywhere else.',
      warning:
        'Listings made by anyone who gets into this Steam session are confirmed too.',
    },
  },

  qr: {
    title: 'Sign in with QR code',
    notSteam: 'That QR code isn’t from a Steam sign-in page.',
    intro:
      'Scan the QR code on the Steam sign-in page with a camera, or paste the link it holds.',
    scan: 'Scan with camera',
    link: 'Link',
    account: 'Account',
    allow: 'Allow sign-in',
  },

  scanner: {
    camera: 'Camera',
    cameraNumber: (n: number) => `Camera ${n}`,
    hint: 'Hold the QR code up to the camera. On a Mac, an iPhone nearby can be picked as a camera too.',
    cameraOff:
      'Camera access is off. Turn it on for Lootify Guard in your system’s privacy settings.',
    noCamera: 'No camera found.',
    cameraFailed: 'Couldn’t start the camera.',
  },
}
