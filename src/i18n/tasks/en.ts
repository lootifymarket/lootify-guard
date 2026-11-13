export const tasks = {
  title: 'Tasks',
  subtitle:
    'Run actions on a whole group of accounts, with limits and random pauses',
  groups: 'Groups',
  allAccounts: 'All accounts',
  noGroup: 'No group',
  groupsHint: 'Make groups on the Accounts screen.',
  task: 'Task',
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
      text: 'Nickname, avatar and privacy',
    },
    freeGames: {
      name: 'Free games',
      text: 'Free licenses by store link or ID',
    },
    events: {
      name: 'Events',
      text: 'Discovery queue and the free sale item',
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

  atOnce: 'At once',
  oneByOne: 'One by one',
  accountsAtOnce: (n: number) => `${n} accounts`,
  pause: 'Pause between accounts',
  noPause: 'None',
  seconds: (min: number, max: number) => `${min}–${max} s`,
  retry: 'Retry failed accounts (up to 3 times)',
  retryLabel: 'Retry failed accounts',
  runOn: (target: string, n: number) => `Run on ${target} (${n})`,
  started: (task: string, target: string) => `“${task}” started on ${target}`,

  profile: {
    nickname: 'Nickname',
    keepAsIs: 'Keep as is',
    templateNote:
      '{n} becomes the account’s place in the group: farm {n} gives farm 1, farm 2…',
    privacy: {
      profile: 'Profile',
      inventory: 'Inventory',
      games: 'Games',
    },
    keep: 'Keep',
    avatarKeep: 'Avatar: keep',
    remove: 'Remove',
    chooseImage: 'Choose image',
  },

  queue: {
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
