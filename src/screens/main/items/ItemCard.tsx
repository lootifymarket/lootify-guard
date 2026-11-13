import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import type { InventoryItem } from '../../../api/inventory.ts'
import Icon from '../../../components/Icon.tsx'
import { useItemIcon } from './itemIcons.ts'
import styles from './ItemCard.module.css'

const CHECK = 'M20 6L9 17l-5-5'
const BOX =
  'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
// For items Steam gives no rarity, like some Dota 2 ones.
const NO_RARITY = '737373'

type Props = {
  accountName: string
  item: InventoryItem
  picked: boolean
  /** The account it's on, when items of many accounts show together. */
  owner?: string
  /** Shown but can't be picked, like an item under a trade hold. */
  unavailable?: string
  onToggle: () => void
}

export default function ItemCard({
  accountName,
  item,
  picked,
  owner,
  unavailable,
  onToggle,
}: Props) {
  const card = useRef<HTMLButtonElement>(null)
  const visible = useVisible(card)
  const picture = useItemIcon(accountName, item.icon, visible)
  const { meta, title } = describe(item)
  return (
    <button
      ref={card}
      type="button"
      className={styles.card}
      aria-pressed={picked}
      disabled={unavailable !== undefined}
      title={unavailable ? `${item.name} · ${unavailable}` : item.name}
      style={
        { '--rarity': `#${item.rarityColor ?? NO_RARITY}` } as CSSProperties
      }
      onClick={onToggle}
    >
      {/* WebKit doesn't lay a button's children out as flex items, so a span does it. */}
      <span className={styles.inner}>
        <span className={styles.picture}>
          {picture ? (
            <img src={picture} alt="" />
          ) : (
            <Icon path={BOX} size={32} stroke={1.5} />
          )}
        </span>
        <span className={styles.words}>
          <span className={styles.meta}>{meta}</span>
          <span
            className={styles.title}
            style={item.color ? { color: `#${item.color}` } : undefined}
          >
            {title}
          </span>
          {(item.amount > 1 || owner || unavailable) && (
            <span className={styles.foot}>
              {[
                unavailable,
                item.amount > 1 ? `${item.amount} pcs` : null,
                owner,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
      </span>
      <span className={styles.check} aria-hidden="true">
        <Icon path={CHECK} size={13} stroke={3} />
      </span>
    </button>
  )
}

/**
 * Splits Steam's name the way the market shows it: "M4A4 | Steel Work (Minimal
 * Wear)" becomes "M4A4 · Minimal Wear" over "Steel Work".
 */
function describe(item: InventoryItem) {
  const [lead, ...rest] = item.name.split(' | ')
  if (rest.length === 0) {
    return { meta: item.kind || item.rarity || '', title: item.name }
  }
  const title = rest.join(' | ').replace(/\s*\([^()]*\)$/, '')
  return {
    meta: [lead, item.exterior ?? item.rarity].filter(Boolean).join(' · '),
    title,
  }
}

/** Whether the element has come into view at least once. */
function useVisible(element: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const target = element.current
    if (!target || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      // Pictures just below the fold start loading before they scroll in.
      { rootMargin: '200px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [element, visible])
  return visible
}
