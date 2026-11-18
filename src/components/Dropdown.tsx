import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import Icon from './Icon.tsx'
import styles from './Dropdown.module.css'

export type DropdownOption = {
  value: string
  label: string
  /** A faint second line, like an address under a name. */
  hint?: string
  icon?: ReactNode
  disabled?: boolean
}

type Props = {
  label: string
  hideLabel?: boolean
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  size?: 'md' | 'sm'
}

const CHEVRON = 'M6 9l6 6 6-6'
const CHECK = 'M20 6L9 17l-5-5'
// Between the trigger and the list, and between the list and the window's edge.
const GAP = 6
const EDGE = 12
const MAX_LIST = 300
// Less room than this below the trigger, and more above, opens the list upwards.
const ENOUGH_BELOW = 160

/** Where the list goes, in the window: fixed, so a dialog's edge can't cut it off. */
type Placement = {
  right: number
  minWidth: number
  top?: number
  bottom?: number
  maxHeight: number
}

function placeBy(trigger: HTMLElement): Placement {
  const rect = trigger.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - GAP - EDGE
  const above = rect.top - GAP - EDGE
  const up = below < ENOUGH_BELOW && above > below
  return {
    right: window.innerWidth - rect.right,
    minWidth: rect.width,
    maxHeight: Math.min(MAX_LIST, up ? above : below),
    ...(up
      ? { bottom: window.innerHeight - rect.top + GAP }
      : { top: rect.bottom + GAP }),
  }
}

export default function Dropdown({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const current = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')
      ?.focus()
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    // The list stays where it opened, so it closes once the page under it moves.
    function closeOnMove(event: Event) {
      if (!list.current?.contains(event.target as Node)) setOpen(false)
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

  function show() {
    if (trigger.current) setPlacement(placeBy(trigger.current))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function pick(option: DropdownOption) {
    if (option.value !== value) onChange(option.value)
    close()
  }

  function moveFocus(event: KeyboardEvent) {
    const items = [
      ...(list.current?.querySelectorAll<HTMLElement>(
        '[role="option"]:not(:disabled)',
      ) ?? []),
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
      setOpen(false)
    }
  }

  return (
    <div className={styles.field} ref={root}>
      <span
        id={labelId}
        className={hideLabel ? styles.hiddenLabel : styles.label}
      >
        {label}
      </span>
      <div className={styles.anchor}>
        <button
          ref={trigger}
          type="button"
          className={`${styles.trigger} ${styles[size]}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open) {
              event.preventDefault()
              show()
            }
          }}
        >
          <span className={styles.current}>
            {current?.icon}
            <span className={styles.text}>{current?.label}</span>
          </span>
          <Icon path={CHEVRON} size={14} stroke={2} />
        </button>
        {open && (
          <div
            ref={list}
            role="listbox"
            aria-labelledby={labelId}
            className={styles.list}
            style={placement ?? undefined}
            onKeyDown={moveFocus}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                className={styles.option}
                // Focus follows the pointer, so only one option is ever highlighted.
                onPointerMove={(event) => event.currentTarget.focus()}
                onClick={() => pick(option)}
              >
                {option.icon}
                <span className={styles.optionText}>
                  <span className={styles.text}>{option.label}</span>
                  {option.hint && (
                    <span className={styles.hint}>{option.hint}</span>
                  )}
                </span>
                <span className={styles.check}>
                  <Icon path={CHECK} size={14} stroke={2.2} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
