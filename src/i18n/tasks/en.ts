export const tasks = {
  title: 'Tasks',
  subtitle: 'Pick a task, then the accounts to run it on',
  allAccounts: 'All accounts',
  noGroup: 'No group',
  /** By the task's kind, as the backend names it. */
  kinds: {
    hourBoost: {
      name: 'Hour boost',
      text: 'Play games on a connection that stays up',
    },
    cardFarming: {
      name: 'Card farming',
      text: 'Play the games with card drops left until they run out',
    },
    moveToStorage: {
      name: 'Move to storage',
      text: 'Every tradable item to one account',
    },
    acceptGifts: {
      name: 'Accept gifts',
      text: 'Incoming offers where the account gives nothing',
    },
    profile: {
      name: 'Profile',
      text: 'Nickname, description, avatar and privacy',
    },
    freeGames: {
      name: 'Free games',
      text: 'Free licenses by store link or ID',
    },
    events: {
      name: 'Events',
      text: 'Discovery queue and the free sale item',
    },
    joinGroups: {
      name: 'Join groups',
      text: 'A few groups from your list each run',
    },
    wishlist: {
      name: 'Wishlist',
      text: 'A few games from a big list each run',
    },
    warmUp: {
      name: 'Warm-up plan',
      text: 'Profile, groups and wishlist over several days',
    },
    check: {
      name: 'Check',
      text: 'Session, profile, Web API key, bans and limits',
    },
    goOffline: {
      name: 'Go offline',
      text: 'Stop playing and sign the game connection out',
    },
  },
  moveTo: (storage: string) => `Move to ${storage}`,

  imageTooBig: 'The image is over 1 MB',

  to: 'To',
  pickAccount: 'Pick an account',
  game: 'Game',
  moveNote:
    'Each account sends an offer with all its tradable items, and the storage account accepts it. No phone needed.',

  games: 'Games',
  ownList: 'Each account’s own list',
  boostNote:
    'App IDs or store links, up to 32. Left empty, each account plays the games on its Playing tab. Accounts keep playing until Go offline, and reconnect by themselves.',

  discoveryQueues: 'Discovery queues',
  queues: (n: number) =>
    n === 0 ? 'None' : n === 1 ? '1 queue' : `${n} queues`,
  claimItem: 'Claim the free sale item',
  eventsNote:
    'During Steam sales and festivals, viewing the queue gives trading cards and the free item is a sticker or similar. With no sale on, there’s nothing to get.',

  freeGamesNote:
    'Store links, app/… or sub/… IDs, split by spaces or commas. A plain number is an app ID. Games already owned are skipped.',

  onlyOwn: 'Only from my accounts',

  groupLinks: 'Groups',
  groupsPlaceholder: 'steamcommunity.com/groups/…, one per line',
  eachRun: 'Each run',
  groupsPerRun: { 1: '1 group', 2: '1–2 groups', 3: '1–3 groups' },
  joinNote:
    'Each account joins this many groups from the list that it isn’t in yet, picked at random. Groups that only take requests or invites are passed over. Run it once a day or so.',
  wishGames: 'Games',
  wishSources: { popular: 'Popular games, built in', mine: 'My list' },
  myGames: 'My games',
  myGamesPlaceholder: 'App IDs or store links',
  wishSizes: { small: '2–4 games', medium: '3–8 games', large: '5–12 games' },
  wishNote:
    'Each account gets its own mix of games. Ones already owned or on the wishlist are skipped.',

  atOnce: 'At once',
  oneByOne: 'One by one',
  accountsAtOnce: (n: number) => `${n} accounts`,
  pause: 'Pause between accounts',
  noPause: 'None',
  seconds: (min: number, max: number) => `${min}–${max} s`,
  retry: 'Retry failed, up to 3 times',
  retryLabel: 'Retry failed accounts',
  runOn: (target: string, n: number) => `Run on ${target} (${n})`,
  sections: {
    playing: 'Playing',
    profile: 'Profile and activity',
    items: 'Items and trades',
    store: 'Store and events',
    checks: 'Checks',
  },
  running: 'Running',
  accounts: 'Accounts',
  pickAccounts: 'Pick accounts…',
  pickedAccounts: 'Chosen accounts',
  accountCount: (n: number) => (n === 1 ? '1 account' : `${n} accounts`),
  selected: (n: number, total: number) => `${n} of ${total} selected`,
  search: 'Search accounts',
  pickAll: 'All',
  pickNone: 'None',
  noMatches: 'No accounts match.',
  runOnPicked: (n: number) =>
    `Run on ${n === 1 ? '1 account' : `${n} accounts`}`,
  started: (task: string, target: string) => `“${task}” started on ${target}`,

  profile: {
    nickname: 'Nickname',
    random: 'Random',
    randomHint: 'A different random nickname for every account',
    keepAsIs: 'Keep as is',
    templateNote:
      '{n} becomes the account’s place in the group: farm {n} gives farm 1, farm 2… {random} gives each account its own random nickname.',
    privacy: {
      profile: 'Profile',
      inventory: 'Inventory',
      games: 'Games',
    },
    keep: 'Keep',
    avatarKeep: 'Avatar: keep',
    remove: 'Remove',
    chooseImage: 'Choose image',
    description: 'Description',
    descriptionModes: {
      keep: 'Keep',
      generate: 'Generate',
      lines: 'From my lines',
    },
    piecesLabel: 'Pieces',
    pieces: {
      greeting: 'Greeting',
      about: 'About',
      games: 'Games',
      status: 'Status',
      quote: 'Quote',
      tradeNote: 'Trade note',
      ascii: 'ASCII art',
      kaomoji: 'Kaomoji',
      divider: 'Dividers',
    },
    language: 'Language',
    languages: {
      mixed: 'English and Russian',
      english: 'English',
      russian: 'Russian',
    },
    length: 'Length',
    lengths: {
      short: 'Short, 1–2 pieces',
      medium: 'Medium, 3–4 pieces',
      long: 'Long, 5–7 pieces',
    },
    examples: 'Examples',
    shuffle: 'Shuffle',
    generateNote:
      'Every account gets its own text: the pieces come in a random order, each with options of its own. No two in a task are the same.',
    myLines: 'My lines',
    linesPlaceholder: '{hey|yo}, just a {CS2|Rust} player from {country}',
    linesNote:
      'One description per line. {a|b|c} picks one of the options, {country} a random country, {n} the account’s place. Each account gets a line at random.',
  },

  plan: {
    steps: {
      description: {
        name: 'Description',
        hint: 'Its own text for every account, made like the Profile task’s',
      },
      groups: {
        name: 'Join groups',
        hint: 'One group a day from the list below',
      },
      wishlist: {
        name: 'Wishlist',
        hint: 'A few games at a time, as set below',
      },
      queue: {
        name: 'Discovery queue',
        hint: 'One queue, like a normal visit to the store',
      },
    },
    over: 'Over',
    days: (n: number) => `${n} days`,
    from: 'From',
    to: 'To',
    note: 'Each account does one step a day, in its own order, at a random time between these hours. Steps run while the app is open, in the tray too. Days it’s off are skipped and the plan ends later, never doubled up. While the vault is locked, the plan waits unless Settings › Keep tasks running while locked is on.',
    started: (target: string) => `Warm-up plan started on ${target}`,
    startOn: (target: string, n: number) => `Start plan on ${target} (${n})`,
    startOnPicked: (n: number) =>
      `Start plan on ${n === 1 ? '1 account' : `${n} accounts`}`,
  },
  queue: {
    dayOf: (day: number, days: number) => `Day ${day} of ${days}`,
    today: (done: number, total: number) => `${done} of ${total} today`,
    nextSoon: 'next any minute',
    nextInMinutes: (n: number) => `next in ~${n} min`,
    nextInHours: (n: number) => `next in ~${n} h`,
    nextAt: (time: string) => `next ${time}`,
    stopPlan: 'Stop plan',
    planStopped: 'Plan stopped',
    title: 'Queue',
    clearFinished: 'Clear finished',
    empty: 'Nothing has run yet.',
    running: 'Running',
    stopped: 'Stopped',
    done: 'Done',
    toLookAt: (n: number) => `${n} to look at`,
    error: 'Error',
    of: (done: number, total: number) => `${done} of ${total}`,
    stoppedToast: 'Task stopped',
    close: 'Close',
    ok: 'OK',
    stop: 'Stop',
    waitingRetry: (tries: number) => `Waiting to try again (${tries} of 3)`,
    waiting: 'Waiting',
    runningAccount: 'Running…',
    skipped: 'Skipped',
  },
}
