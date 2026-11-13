const items = (n: number) => (n === 1 ? '1 item' : `${n} items`)

export const inventory = {
  title: 'Inventory',
  shownItems: 'Items',
  subtitle: 'Every item from every account in one place.',
  items,
  account: 'Account',
  allAccounts: 'All accounts',
  group: 'Group',
  game: 'Game',
  search: 'Search items',
  sort: 'Sort',
  sorts: {
    rarity: 'Rarity, rarest first',
    name: 'Name A–Z',
    account: 'Account',
  },
  tradableOnly: 'Tradable only',
  selected: (n: number) => `${n} selected`,
  clearSelection: 'Clear selection',
  clickToSelect: 'Click items to select them',
  selectAll: 'Select all',
  loadingMore: (n: number) =>
    `Loading ${n} more ${n === 1 ? 'account' : 'accounts'}…`,
  moveToOne: 'Move to one account',
  steamMarket: 'Steam market',
  notTradable: 'Not tradable now',
  noneSignedIn: 'No account is signed in to Steam.',
  noItems: (game: string) => `No ${game} items on these accounts.`,
  nothingFound: 'Nothing found.',

  card: {
    pieces: (n: number) => `${n} pcs`,
  },

  move: {
    title: 'Move to one account',
    moveTo: 'Move to',
    pickedHere: (n: number) => `${n} picked items here`,
    moved: 'Moved',
    sentWaiting: (target: string, reason: string) =>
      `Sent, but ${target} couldn’t take it yet. It waits on the Trades screen. (${reason})`,
    done: 'Done',
    allThere: (target: string) => `Everything picked is already on ${target}.`,
    plan: (count: number, accounts: number, target: string) =>
      `${items(count)} from ${accounts} ${accounts === 1 ? 'account' : 'accounts'} ${count === 1 ? 'goes' : 'go'} to ${target}. Each account sends a trade, Guard confirms it, and ${target} accepts it, so no phone is needed.`,
    staying: (n: number) =>
      ` ${n} picked ${n === 1 ? 'item is' : 'items are'} already there and stay.`,
    moving: 'Moving…',
    movedTo: (count: number, target: string) =>
      `Moved ${items(count)} to ${target}`,
    move: (n: number) => `Move ${items(n)}`,
  },

  market: {
    title: 'List on the Steam market',
    intro:
      'Set what the buyer pays. Steam keeps 5% and the game 10%, and Guard confirms the listings right away.',
    skipped: (n: number) =>
      ` ${n} picked ${n === 1 ? 'item' : 'items'} can’t be listed now and ${n === 1 ? 'is' : 'are'} left out.`,
    noPrices: (reason: string) => `Couldn’t get market prices: ${reason}`,
    asking: 'Asking the market…',
    lowest: (price: string) => `Lowest ${price}`,
    median: (price: string) => `median ${price}`,
    noPrice: 'No market price',
    buyerPays: (name: string) => `Buyer pays for ${name}`,
    youGet: (money: string) => `you get ${money}`,
    youGetTotal: (money: string) => `You get about ${money} in all`,
    listing: 'Listing…',
    listedToast: (count: number) => `Listed ${items(count)}`,
    list: (n: number) => `List ${items(n)}`,
    listed: 'Listed',
    unconfirmed:
      'Listed, but waiting for a confirmation on the Steam Guard screen',
    needsEmail: 'Listed, waiting for the email confirmation Steam sent',
    done: 'Done',
  },
}
