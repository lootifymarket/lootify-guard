import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Group } from '../../../api/accounts.ts'
import { addToGroup, removeFromGroup } from '../../../api/groups.ts'
import { errorMessage } from '../../../api/vault.ts'
import Icon from '../../../components/Icon.tsx'
import { placeBy, type Placement } from '../../../components/placement.ts'
import dropdownStyles from '../../../components/Dropdown.module.css'
import { useT } from '../../../i18n/index.ts'
import { useToast } from '../../../lib/toast.ts'
import tint from './groupColor.module.css'
import styles from './GroupPills.module.css'

const PLUS = 'M12 5v14M5 12h14'
const CROSS = 'M18 6L6 18M6 6l12 12'
// The menu is wider than the button that opens it.
const MENU_WIDTH = 200

type Props = {
  accountName: string
  groupIds: number[]
  groups: Group[]
  onChanged: () => void
  /** Offers to make a new group with this account in it. */
  onNewGroup?: () => void
  /** Shown when the account is in no group. */
  emptyLabel?: string
}

/** The account's groups as pills, each with a way out, and a plus to add one. */
export default function GroupPills({
  accountName,
  groupIds,
  groups,
  onChanged,
  onNewGroup,
  emptyLabel = '—',
}: Props) {
  const t = useT().groups
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const root = useRef<HTMLSpanElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = placement !== null
  const known = new Map(groups.map((group) => [group.id, group]))
  const joined = groupIds.filter((id) => known.has(id))
  const others = groups.filter((group) => !groupIds.includes(group.id))

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !menu.current?.contains(target)) {
        setPlacement(null)
      }
    }
    // The menu stays where it opened, so it closes once the page under it moves.
    function closeOnMove(event: Event) {
      if (!menu.current?.contains(event.target as Node)) setPlacement(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('scroll', closeOnMove, true)
    window.addEventListener('resize', closeOnMove)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('scroll', closeOnMove, true)
      window.removeEventListener('resize', closeOnMove)
    }
  }, [open])

  function close() {
    setPlacement(null)
    plus.current?.focus()
  }

  async function change(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  function moveFocus(event: KeyboardEvent) {
    const items = [
      ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = {
      ArrowDown: Math.min(index + 1, items.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: items.length - 1,
    }[event.key]
    if (next !== undefined) {
      event.preventDefault()
      items[next]?.focus()
    } else if (event.key === 'Escape') {
      // Inside a <dialog>, Escape would also close the dialog.
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      setPlacement(null)
    }
  }

  return (
    <span className={styles.pills} ref={root}>
      {joined.length === 0 && (
        <span className={styles.empty}>{emptyLabel}</span>
      )}
      {joined.map((id) => {
        const { name, color } = known.get(id)!
        return (
          <span
            key={id}
            className={`${styles.pill} ${tint.tint}`}
            data-color={color}
          >
            <span className={styles.name}>{name}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={t.leaveGroup(accountName, name)}
              title={t.leaveGroup(accountName, name)}
              disabled={busy}
              onClick={() =>
                void change(() => removeFromGroup([accountName], id))
              }
            >
              <Icon path={CROSS} size={11} stroke={2.4} />
            </button>
          </span>
        )
      })}
      {(others.length > 0 || onNewGroup) && (
        <button
          ref={plus}
          type="button"
          className={styles.add}
          aria-label={t.addToGroup(accountName)}
          title={t.addToGroup(accountName)}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={() =>
            open
              ? setPlacement(null)
              : plus.current &&
                setPlacement({
                  ...placeBy(plus.current),
                  minWidth: MENU_WIDTH,
                })
          }
        >
          <Icon path={PLUS} size={12} stroke={2.2} />
        </button>
      )}
      {/* On the page itself: a table row's scrolling and animated parents would
          otherwise cut the menu off or move it away from the plus. */}
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={t.addToGroup(accountName)}
            className={`${dropdownStyles.list} ${styles.menu}`}
            style={placement}
            onKeyDown={moveFocus}
          >
            {others.map((group) => (
              <button
                key={group.id}
                type="button"
                role="menuitem"
                className={dropdownStyles.option}
                onPointerMove={(event) => event.currentTarget.focus()}
                onClick={() => {
                  close()
                  void change(() => addToGroup([accountName], group.id))
                }}
              >
                <span className={tint.tint} data-color={group.color}>
                  <span className={tint.dot} />
                </span>
                <span className={dropdownStyles.optionText}>
                  <span className={dropdownStyles.text}>{group.name}</span>
                </span>
              </button>
            ))}
            {onNewGroup && (
              <button
                type="button"
                role="menuitem"
                className={`${dropdownStyles.option} ${styles.newGroup}`}
                onPointerMove={(event) => event.currentTarget.focus()}
                onClick={() => {
                  close()
                  onNewGroup()
                }}
              >
                <Icon path={PLUS} size={13} stroke={2} />
                <span className={dropdownStyles.text}>{t.newGroupItem}</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}
