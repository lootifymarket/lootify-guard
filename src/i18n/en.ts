import { accounts } from './accounts/en.ts'
import { guard } from './guard/en.ts'
import { account } from './account/en.ts'
import { addAccount } from './addAccount/en.ts'
import { groups } from './groups/en.ts'

/** Every word the app shows, in English. Other languages fill the same shape. */
export const en = {
  accounts,
  guard,
  account,
  addAccount,
  groups,

  common: {
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    continue: 'Continue',
    change: 'Change',
    export: 'Export',
    copied: 'Copied',
    copyFailed: 'Couldn’t copy',
  },

  errors: {
    wrongPassword: 'Wrong password',
    locked: 'The vault is locked',
    biometricsOutdated:
      'Biometric unlock no longer matches this vault. Use your password.',
    cancelled: 'Cancelled',
  },

  time: {
    justNow: 'just now',
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => `${n} d`,
  },

  onboarding: {
    steps: ['Welcome', 'Master password'],
    promises: [
      {
        title: 'Stays on your computer',
        text: 'No cloud. Secrets are encrypted locally and never leave this device.',
      },
      {
        title: 'Open source',
        text: 'Every line is public on GitHub, so anyone can check what it does.',
      },
      {
        title: 'Built for traders and farms',
        text: 'Guard codes, confirmations, trades, proxies and bulk tasks.',
      },
    ],
    asideNote:
      'Everything stays on this computer, encrypted with your master password. Lootify never receives your passwords or Steam Guard secrets.',
    welcomeTitle: 'Welcome to Lootify Guard',
    welcomeLead:
      'Steam Guard codes, trade confirmations and all your Steam accounts in one encrypted vault on this computer.',
    getStarted: 'Get started',
    createTitle: 'Create a master password',
    createLead:
      'It encrypts your vault, and you’ll enter it every time you open the app. Nobody can read your vault without it, not even us.',
    masterPassword: 'Master password',
    repeatPassword: 'Repeat password',
    passphraseHint:
      'Use a long passphrase. Four or more random words work well.',
    weak: 'Weak password',
    good: 'Good password',
    strong: 'Strong password',
    mismatch: 'Passwords don’t match',
    recommended: 'Recommended',
    rules: {
      length: 'At least 12 characters',
      lengthMissing: 'Shorter than 12 characters',
      numberOrSymbol: 'A number or a symbol',
      numberOrSymbolMissing: 'No numbers or symbols',
      mixedCase: 'Upper and lower case letters',
      mixedCaseMissing: 'Not mixing upper and lower case',
    },
    unlockWith: (name: string) => `Unlock with ${name}`,
    unlockWithText:
      'Also lets you set a new password on this computer if you forget it.',
    biometricFailed: (name: string, error: string) =>
      `The vault is ready, but ${name} couldn’t be turned on: ${error}`,
    creating: 'Creating vault…',
    create: 'Create vault',
    weakTitle: 'This password is easy to guess',
    weakText:
      'If malware copies your vault file, a weak password can be cracked offline in hours, exposing every Steam Guard secret inside. A long passphrase takes years.',
    useAnyway: 'Use it anyway',
    makeStronger: 'Make it stronger',
  },

  unlock: {
    footnote: 'Your data is encrypted and stored only on this device.',
    enterPassword: 'Enter your password',
    decrypting: 'Decrypting your vault…',
    prompt: 'Enter your master password to open the vault.',
    masterPassword: 'Master password',
    opening: 'Opening…',
    unlock: 'Unlock',
    unlockWith: (name: string) => `Unlock with ${name}`,
    forgot: 'Forgot password?',
    recoverTitle: 'Reset your password',
    recoverText: (name: string) =>
      `${name} is turned on for this vault. Confirm it’s you, then choose a new master password.`,
    verifiedWith: (name: string) => `Verified with ${name}`,
    newPassword: 'New master password',
    repeatPassword: 'Repeat password',
    recommended: '12+ characters recommended',
    mismatch: 'Passwords don’t match',
    weak: 'Weak: easy to crack if the vault file is stolen',
    looksGood: 'Looks good',
    repeat: 'Repeat the password',
    reencrypting: 'Re-encrypting vault…',
    saveAndUnlock: 'Save and unlock',
    waitingFor: (name: string) => `Waiting for ${name}…`,
    verifyWith: (name: string) => `Verify with ${name}`,
    unavailable: (name: string) => `${name} isn’t available`,
    resetTitle: 'The vault can’t be opened',
    resetText: (name: string | null) =>
      `Without the password${name ? ` or ${name}` : ''} nobody can decrypt it, not even us. That’s the point of the encryption. Erase it and start over; your Steam accounts aren’t lost.`,
    waysTitle: 'Getting your accounts back after a reset',
    ways: [
      {
        title: 'Restore from a backup',
        text: 'Import your .maFile files or a vault backup made in Settings.',
      },
      {
        title: 'Use Steam revocation codes',
        text: 'Each R-code removes Steam Guard from its account. Then add the account again.',
      },
      {
        title: 'Contact Steam Support',
        text: 'For accounts with neither a backup nor an R-code.',
      },
    ],
    /** The word typed to confirm; kept the same in every language. */
    resetWord: 'RESET',
    typeReset: 'Type RESET to erase this vault',
    erasing: 'Erasing…',
    erase: 'Erase vault and start over',
    remembered: '← I remembered it',
  },

  sidebar: {
    menu: 'Main menu',
    accounts: 'Accounts',
    guard: 'Steam Guard',
    trades: 'Trades',
    inventory: 'Inventory',
    tasks: 'Tasks',
    proxies: 'Proxies',
    add: 'Add account',
    settings: 'Settings',
    vaultUnlocked: 'Vault unlocked',
    locksIn: (minutes: number) => `Locks in ${minutes} min`,
    lock: 'Lock',
  },

  settings: {
    title: 'Settings',
    display: 'Display',
    language: 'Language',
    streamer: 'Streamer mode',
    streamerHint:
      'Blurs Steam Guard codes, Steam IDs, trade URLs, balances and prices, for streams and screenshots.',
    security: 'Security',
    autoLock: 'Auto-lock',
    autoLockHint:
      'Locks the vault after this long without activity. Auto-confirm runs only while it’s unlocked.',
    minutes: (n: number) => (n === 60 ? '1 hour' : `${n} minutes`),
    never: 'Never',
    unlockWith: (name: string) => `Unlock with ${name}`,
    biometricHint: (name: string) =>
      `The vault key is kept in the login keychain, and the app asks for ${name} before using it.`,
    masterPassword: 'Master password',
    backup: 'Backup',
    backupNever: 'Not saved yet. ',
    backupJustNow: 'Saved just now. ',
    backupAgo: (when: string) => `Last saved ${when} ago. `,
    backupHint:
      'The file holds every account and Guard secret, encrypted with the master password.',
    backupSaved: 'Backup saved',
    app: 'App',
    startup: 'Launch at startup',
    startupHint: 'Starts in the tray with the vault locked.',
    tray: 'Keep running in the tray',
    trayHint:
      'Closing the window leaves auto-confirm, playing and card farming running. Quit from the tray icon.',
    passwordChanged: 'Master password changed',
  },

  changePassword: {
    title: 'Change master password',
    current: 'Current password',
    new: 'New password',
    repeat: 'Repeat new password',
    mismatch: 'Passwords don’t match',
    weak: 'Weak: use 12+ characters, mixed case and a number or symbol',
    movesBiometric: (name: string) =>
      `The vault is re-encrypted, and ${name} moves to the new password.`,
    reencrypted: 'The vault is re-encrypted with the new password.',
    wrongCurrent: 'The current password is wrong',
    reencrypting: 'Re-encrypting…',
  },
}

export type Dictionary = typeof en
