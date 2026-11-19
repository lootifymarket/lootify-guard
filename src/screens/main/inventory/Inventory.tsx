import { useEffect, useEffectEvent, useState } from 'react'
import type { Account, Group } from '../../../api/accounts.ts'
import {
  GAME_NAMES,
  inventoryItems,
  type Game,
  type InventoryItem,
} from '../../../api/inventory.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import Toggle from '../../../components/Toggle.tsx'
import { useT } from '../../../i18n/index.ts'
import ItemCard from '../items/ItemCard.tsx'
import layout from '../layout.module.css'
import ListOnMarket from './ListOnMarket.tsx'
import MoveItems from './MoveItems.tsx'
import styles from './Inventory.module.css'

type Sort = 'name' | 'rarity' | 'account'

const SORTS: Sort[] = ['rarity', 'name', 'account']

const SKELETON_CARDS = 10

// Rarity names differ by game and item kind; these put them on one scale.
const RARITY_TIER: Record<string, number> = {
  'Base Grade': 1,
  'Consumer Grade': 1,
  Common: 1,
  'Industrial Grade': 2,
  Uncommon: 2,
  'Mil-Spec Grade': 3,
  'High Grade': 3,
  Rare: 3,
  Restricted: 4,
  Remarkable: 4,
  Mythical: 4,
  Classified: 5,
  Exotic: 5,
  Legendary: 5,
  Covert: 6,
  Extraordinary: 6,
  Ancient: 6,
  Immortal: 6,
  Contraband: 7,
  Arcana: 7,
}

/** An item and the account it's on. */
type Owned = { account: string; item: InventoryItem }

const keyOf = ({ account, item }: Owned) => `${account}/${item.assetId}`

type Props = {
  accounts: Account[]
  groups: Group[]
  /** Steam turned a session down, so the account list is out of date. */
  onChanged: () => void
}

/** Every item of every signed-in account in one grid. */
export default function Inventory({ accounts, groups, onChanged }: Props) {
  const t = useT().inventory
  const signedIn = accounts.filter((account) => account.signedIn)
  const [game, setGame] = useState<Game>('cs2')
  const [accountFilter, setAccountFilter] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('rarity')
  const [tradableOnly, setTradableOnly] = useState(false)
  const [loaded, setLoaded] = useState<Record<string, InventoryItem[]>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState(false)
  const [listing, setListing] = useState(false)
  const [reloads, setReloads] = useState(0)
  const names = signedIn.map((account) => account.accountName).join('\n')

  // Steam may have turned the session down, which the account list should show.
  const failed = useEffectEvent((account: string, err: unknown) => {
    setFailures((done) => ({ ...done, [account]: errorMessage(err) }))
    onChanged()
  })

  // Accounts load one after another, and the grid fills in as each arrives.
  useEffect(() => {
    let current = true
    void (async () => {
      for (const account of names.split('\n').filter(Boolean)) {
        try {
          const items = await inventoryItems(account, game)
          if (!current) return
          setLoaded((done) => ({ ...done, [account]: items }))
        } catch (err) {
          if (current) failed(account, err)
        }
      }
    })()
    return () => {
      current = false
    }
  }, [names, game, reloads])

  function reload() {
    setLoaded({})
    setFailures({})
    setPicked(new Set())
    setReloads((n) => n + 1)
  }

  function pickGame(next: Game) {
    setGame(next)
    setLoaded({})
    setFailures({})
    setPicked(new Set())
  }

  // The filter holds a login, or "group:" and a group's id; logins have no colons.
  function shows(filter: string, account: string) {
    if (!filter) return true
    if (!filter.startsWith('group:')) return account === filter
    const groupId = Number(filter.slice('group:'.length))
    return (
      signedIn
        .find((known) => known.accountName === account)
        ?.groupIds.includes(groupId) ?? false
    )
  }

  const all: Owned[] = Object.entries(loaded).flatMap(([account, items]) =>
    items.map((item) => ({ account, item })),
  )
  const needle = query.trim().toLowerCase()
  const shown = all
    .filter(({ account }) => shows(accountFilter, account))
    .filter(({ item }) => !tradableOnly || item.tradable)
    .filter(({ item }) => item.name.toLowerCase().includes(needle))
    .sort(compare(sort))
  const chosen = all.filter((owned) => picked.has(keyOf(owned)))
  const waiting =
    signedIn.length - Object.keys(loaded).length - Object.keys(failures).length

  function toggle(owned: Owned) {
    setPicked((current) => {
      const next = new Set(current)
      const key = keyOf(owned)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  return (
    <>
      <div className={layout.header}>
        <div className={styles.heading}>
          <h1 className={layout.title}>{t.title}</h1>
          <span className={styles.subtitle}>{t.subtitle}</span>
        </div>
        <span className={styles.total}>
          <span className={styles.totalLabel}>{t.shownItems}</span>
          <span className={styles.totalValue}>{shown.length}</span>
        </span>
      </div>

      <div className={styles.filters}>
        <div className={styles.account}>
          <Dropdown
            label={t.account}
            hideLabel
            size="sm"
            value={accountFilter}
            options={[
              { value: '', label: t.allAccounts },
              ...groups.map((group) => ({
                value: `group:${group.id}`,
                label: group.name,
                hint: t.group,
              })),
              ...signedIn.map((account) => ({
                value: account.accountName,
                label: account.personaName || account.accountName,
                hint: account.personaName ? account.accountName : undefined,
              })),
            ]}
            onChange={setAccountFilter}
          />
        </div>
        <div className={styles.game}>
          <Dropdown
            label={t.game}
            hideLabel
            size="sm"
            value={game}
            options={(Object.entries(GAME_NAMES) as [Game, string][]).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value) => pickGame(value as Game)}
          />
        </div>
        <input
          type="search"
          aria-label={t.search}
          placeholder={t.search}
          className={`${layout.search} ${styles.search}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.sort}>
          <Dropdown
            label={t.sort}
            hideLabel
            size="sm"
            value={sort}
            options={SORTS.map((value) => ({
              value,
              label: t.sorts[value],
            }))}
            onChange={(value) => setSort(value as Sort)}
          />
        </div>
        <span className={styles.toggle}>
          {t.tradableOnly}
          <Toggle
            on={tradableOnly}
            label={t.tradableOnly}
            onChange={setTradableOnly}
          />
        </span>
      </div>

      <div className={styles.bar} data-picked={chosen.length > 0}>
        {chosen.length > 0 ? (
          <span className={styles.barWords}>
            <span>{t.selected(chosen.length)}</span>
            <button
              type="button"
              className={styles.link}
              onClick={() => setPicked(new Set())}
            >
              {t.clearSelection}
            </button>
          </span>
        ) : (
          <span className={styles.barWords}>
            <span className={styles.muted}>{t.clickToSelect}</span>
            {shown.some(({ item }) => item.tradable) && (
              <button
                type="button"
                className={styles.link}
                onClick={() =>
                  setPicked(
                    new Set(
                      shown.filter(({ item }) => item.tradable).map(keyOf),
                    ),
                  )
                }
              >
                {t.selectAll}
              </button>
            )}
          </span>
        )}
        {waiting > 0 && (
          <span className={styles.muted}>{t.loadingMore(waiting)}</span>
        )}
        <span className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            disabled={chosen.length === 0}
            onClick={() => setMoving(true)}
          >
            {t.moveToOne}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!chosen.some(({ item }) => item.marketable)}
            onClick={() => setListing(true)}
          >
            {t.steamMarket}
          </Button>
        </span>
      </div>

      <MoveItems
        open={moving}
        accounts={accounts}
        picked={byAccount(chosen)}
        onClose={() => setMoving(false)}
        onMoved={reload}
      />
      <ListOnMarket
        open={listing}
        game={game}
        picked={byAccount(chosen)}
        onClose={() => setListing(false)}
        onListed={reload}
      />

      {Object.entries(failures).map(([account, reason]) => (
        <p key={account} className={styles.error} role="alert">
          {account}: <span className={styles.reason}>{reason}</span>
        </p>
      ))}

      {shown.length === 0 && waiting > 0 ? (
        <div className={styles.grid}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton height={88} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="50%" height={10} />
              <Skeleton width="40%" height={13} />
            </div>
          ))}
        </div>
      ) : shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((owned) => (
            <ItemCard
              key={keyOf(owned)}
              accountName={owned.account}
              item={owned.item}
              picked={picked.has(keyOf(owned))}
              owner={
                accountFilter && !accountFilter.startsWith('group:')
                  ? undefined
                  : owned.account
              }
              unavailable={owned.item.tradable ? undefined : t.notTradable}
              onToggle={() => toggle(owned)}
            />
          ))}
        </div>
      ) : (
        waiting === 0 && (
          <p className={layout.note}>
            {signedIn.length === 0
              ? t.noneSignedIn
              : all.length === 0
                ? t.noItems(GAME_NAMES[game])
                : t.nothingFound}
          </p>
        )
      )}
    </>
  )
}

function byAccount(owned: Owned[]) {
  const groups: Record<string, InventoryItem[]> = {}
  for (const { account, item } of owned) {
    ;(groups[account] ??= []).push(item)
  }
  return groups
}

function compare(sort: Sort) {
  const byName = (a: Owned, b: Owned) => a.item.name.localeCompare(b.item.name)
  if (sort === 'name') return byName
  if (sort === 'account') {
    return (a: Owned, b: Owned) =>
      a.account.localeCompare(b.account) || byName(a, b)
  }
  const tier = ({ item }: Owned) => RARITY_TIER[item.rarity ?? ''] ?? 0
  return (a: Owned, b: Owned) => tier(b) - tier(a) || byName(a, b)
}
