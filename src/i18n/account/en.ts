export const account = {
  back: '← Accounts',
  importedFromMaFile: 'Imported from .maFile',
  guardTitle: 'Steam Guard',
  copy: 'Copy',
  refresh: 'Refresh',
  refreshTitle:
    'Load the profile, wallet and security details from Steam again',
  refreshesIn: (seconds: number) => `Refreshes in ${seconds} s`,
  sections: 'Sections',
  tabs: {
    profile: 'Profile',
    playing: 'Playing',
    security: 'Security',
  },

  status: {
    playing: 'playing',
    signedIn: 'signed in',
    notSignedIn: 'not signed in',
  },

  security: {
    title: 'Security',
    steamSession: 'Steam session',
    signedIn: 'Signed in',
    notSignedIn: 'Not signed in',
    check: 'Check',
    checking: 'Checking…',
    signIn: 'Sign in',
    sessionAccepted: 'Steam accepted the session.',
    webApiKey: 'Web API key',
    signInToCheck: 'Sign in to check',
    activeSessions: 'Active sessions',
    show: 'Show',
    hide: 'Hide',
    devices: 'Devices',
    wallet: 'Wallet',
    proxy: 'Proxy',
    noProxy: 'No proxy',
    deletedProxy: 'Deleted proxy',
    group: 'Group',
    note: 'Note',
    notePlaceholder: 'Only you see it',
    noteSaved: 'Note saved',
    noGroup: 'No group',
    steamId: 'Steam ID',
    appearsAfterSignIn: 'Appears after you sign in',
    revocationCode: 'Revocation code',
    notInMaFile: 'Not in the .maFile',
    deviceId: 'Device ID',
    proxyDeleted:
      'This account’s proxy was deleted. It can’t reach Steam until you pick another proxy or No proxy.',
    noOtherDevice: 'No other device was signed in.',
    signedOutDevices: (n: number) =>
      `Signed out ${n} ${n === 1 ? 'device' : 'devices'}.`,
    signOutEverywhere: 'Sign out everywhere',
    exportMaFile: 'Export .maFile',
    exportDetails: 'Export with details',
    remove: 'Remove from Lootify Guard',
    saved: (file: string) => `Saved ${file}`,
    unknown: 'Unknown',
    none: 'None',
    yours: ' · yours',
    onlyThisApp: 'Only this app',
    thisAppAnd: (n: number) =>
      `This app and ${n} ${n === 1 ? 'other device' : 'other devices'}`,
    noWallet: 'No wallet',
    pending: (balance: string, pending: string) =>
      `${balance} · ${pending} pending`,
  },

  browser: {
    title: 'Browser',
    signIns: 'Saved sign-ins',
    sites: (n: number) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    nothingSaved: 'Nothing yet',
    clear: 'Clear',
    cleared: 'Sign-ins cleared',
    hint: 'The account’s browser tab keeps sign-ins to other sites, like its mailbox, in the encrypted vault. Steam itself is signed in fresh each time.',
  },

  autoConfirm: {
    ruleOn: (label: string) => `${label}: on`,
    ruleOff: (label: string) => `${label}: off`,
    title: 'Auto-confirm',
    setForMany: 'Set for many accounts',
    notUntilSignedIn:
      'Nothing is confirmed until the account is signed in to Steam.',
    howOften:
      'Checked every minute while the vault is unlocked. API keys, phone changes and account recovery are never confirmed automatically.',
  },

  reveal: {
    title: 'Show revocation code',
    text: 'The code removes Steam Guard from the account. Confirm it’s you first.',
    action: 'Show',
  },

  exportFile: {
    title: 'Export .maFile',
    text: 'The file holds this account’s Steam Guard secrets unencrypted. Anyone who gets it can sign in with its codes and confirm trades. Keep it where only you can reach it.',
    action: 'Save file…',
  },

  exportDetails: {
    title: 'Export with details',
    text: 'Saves a folder with the .maFile and account_details.json, which has the login, password and revocation code. Nothing in it is encrypted: anyone who gets it can sign in, confirm trades and remove Steam Guard. Keep it where only you can reach it.',
    action: 'Save folder…',
  },

  confirmOwner: {
    masterPassword: 'Master password',
    use: (name: string) => `Use ${name}`,
  },

  apiKey: {
    found: 'A Web API key was found on this account',
    domain: (domain: string) =>
      `Domain ${domain}. If it wasn’t you, revoke it, or your trades can be hijacked.`,
    mine: 'It’s mine',
    revoke: 'Revoke',
    revokeTitle: 'Revoke the API key?',
    revokeText: (domain: string) =>
      `The ${domain} key will be deleted and every deal through it stops working. If you didn’t make it, change the Steam password right away: whoever made it was in the account.`,
    revoking: 'Revoking…',
  },

  device: {
    thisApp: ' · this app',
    nameFor: (name: string | null) =>
      name ? `Name for ${name}` : 'Name for this device',
    name: 'Name',
    rename: 'Rename',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    kinds: {
      steamClient: 'Steam client',
      browser: 'Browser',
      mobileApp: 'Mobile app',
      unknown: 'Device',
    },
  },

  signOut: {
    title: 'Sign out everywhere?',
    nothingElse: 'No device but this app is signed in to the account.',
    others:
      'Steam ends every session except this app. These devices will ask to sign in again:',
    signOut: 'Sign out everywhere',
    signingOut: 'Signing out…',
  },

  signIn: {
    title: 'Sign in to Steam',
    text: (accountName: string) =>
      `Lootify Guard signs in as ${accountName} and confirms with this account’s Steam Guard code. The password goes only to Steam.`,
    password: 'Steam password',
    savePassword: 'Save the password, not just the session',
    savePasswordLabel: 'Save password',
    wrongPassword: 'Steam says the password is wrong',
    signingIn: 'Signing in…',
    signIn: 'Sign in',
  },

  remove: {
    title: (accountName: string) => `Remove ${accountName}?`,
    text: (withCode: boolean) =>
      `The account is removed from this app only. Steam Guard stays on in Steam, so without ${withCode ? 'the .maFile or the revocation code' : 'the .maFile'} you lose access to it for good.`,
    backedUp: (withCode: boolean): string =>
      withCode
        ? 'I exported the .maFile or saved the revocation code'
        : 'I exported the .maFile',
    remove: 'Remove',
  },

  standing: {
    trading: 'Trading and market',
    bans: 'VAC and game bans',
    limited: 'Limited',
    unknown: 'Unknown',
    signInToCheck: 'Sign in to check',
    tradeBanned: 'Trade banned',
    probation: 'On trade probation',
    available: 'Available',
    restrictedUntil: (date: string) => `Restricted until ${date}`,
    restricted: 'Restricted',
    noTradeBan: 'No trade ban',
    vacBanned: 'VAC banned',
    noVacBan: 'No VAC ban',
    vacBans: (n: number) => `${n} VAC ${n === 1 ? 'ban' : 'bans'}`,
    gameBans: (n: number) => `${n} game ${n === 1 ? 'ban' : 'bans'}`,
    communityBan: 'community ban',
    none: 'None',
    daysAgo: (n: number) => ` · ${n} ${n === 1 ? 'day' : 'days'} ago`,
    limitedYes: 'Yes, until $5 is spent in Steam',
    limitedNo: 'No',
  },

  profile: {
    urlCopied: 'Trade URL copied',
    urlMade: 'New trade URL created',
    historyCleared: 'Nickname history cleared',
    avatarUpdated: 'Avatar updated',
    signInFirst: 'Sign in to Steam on the Security tab to see the profile.',
    loading: 'Loading the profile…',
    saved: 'Profile updated on Steam',
    nickname: 'Nickname',
    url: 'Profile URL',
    notSet: 'Not set',
    summary: 'Summary',
    privacy: {
      profile: 'Profile',
      inventory: 'Inventory',
      games: 'Games',
    },
    visibility: {
      public: 'Public',
      friendsOnly: 'Friends only',
      private: 'Private',
    },
    pastNames: 'Past nicknames',
    clearHistory: 'Clear nickname history',
    saving: 'Saving…',
    clearTitle: 'Clear nickname history?',
    clearText:
      'Steam removes the list of past nicknames others see on the profile. This can’t be undone.',
    clear: 'Clear',
    tradeUrl: 'Trade URL',
    loadingUrl: 'Loading…',
    refresh: 'Refresh',
    tradeUrlHint: 'Anyone with this link can send the account trade offers.',
    newTradeUrl: 'New trade URL',
    newTradeUrlText:
      'The old link stops working and offers sent to it won’t arrive. Update it on Lootify and with your partners.',
    uploading: 'Uploading…',
    changeAvatar: 'Change avatar',
    avatarHint: 'JPG, PNG or GIF, up to 1 MB.',
  },

  playing: {
    freeNoAnswer: 'Steam didn’t answer the request to add the free games.',
    freeRefused: (code: number) =>
      `Steam didn’t add the free games (error ${code}).`,
    freeAdded: (games: string) => `Steam added ${games}.`,
    freeNotAdded: (games: string) =>
      `Not added, the account has them already or Steam didn’t give them: ${games}.`,
    applied: 'Games updated',
    label: 'Playing',
    signInFirst: 'Sign in to Steam on the Security tab to play games.',
    applyChanges: 'Apply changes',
    start: 'Start',
    stop: 'Stop',
    cardFarming: 'Card farming',
    farmCards: 'Farm cards',
    games: (count: number, room: number) => `Games · ${count} of ${room}`,
    statusTakesPlace: ' (the status takes one place)',
    app: (id: number) => `App ${id}`,
    remove: (name: string) => `Remove ${name}`,
    addGame: '+ Game',
    status: 'Custom status (shown on the profile instead of a game)',
    statusPlaceholder: 'Trading on Lootify Market',
    presence: 'Presence',
    presences: {
      online: 'Online',
      away: 'Away',
      busy: 'Do not disturb',
      invisible: 'Invisible',
    },
    hint: 'Steam counts hours only for games the account owns. Playing here while someone plays on another device pauses until they stop.',
    notPlaying: 'Not playing',
    startHint: 'Start to show the games on the profile',
    stopped: 'Stopped playing',
    connecting: 'Connecting…',
    connectingText: 'Signing in to Steam as the client',
    nowPlaying: 'Now playing',
    paused: 'Paused',
    pausedText:
      'Someone is playing on another device; hours resume when they stop',
    reconnecting: 'Reconnecting',
    tryingAgain: (reason: string, seconds: number) =>
      `${reason}. Trying again in ${seconds} s`,
    elapsedHours: (hours: number, minutes: string) =>
      `${hours} h ${minutes} min`,
    elapsedMinutes: (minutes: number, seconds: string) =>
      `${minutes} min ${seconds} s`,
    farmIdle: 'Plays the games that still drop cards until they run out',
    farmChecking: 'Reading the badges…',
    farmDone: 'No card drops left',
    dropsLeft: (drops: number, games: number) =>
      `${drops} drops left in ${games} games`,
    farmPlaying: (name: string) => `playing ${name}`,
    buildingHours: (games: number) => `building hours in ${games} games`,
    nextCheck: (minutes: number) => `next check in ${minutes} min`,
  },

  picker: {
    title: 'Add games',
    picked: (count: number, room: number) => `Picked · ${count} of ${room}`,
    find: 'Find game',
    findPlaceholder: 'Name or app ID',
    loading: 'Loading the account’s games…',
    noGames: 'Steam shows no games, or the account’s game details are private.',
    app: (id: number) => `App ${id}`,
    hours: (hours: number) => `${hours} h`,
    done: 'Done',
    inLibrary: 'In the library',
    freeToAdd: 'Free to play',
    freeHint: 'added to the account when it starts playing',
    free: 'Free',
  },
}
