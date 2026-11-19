// Between the trigger and the list, and between the list and the window's edge.
const GAP = 6
const EDGE = 12
const MAX_LIST = 300
// Less room than this below the trigger, and more above, opens the list upwards.
const ENOUGH_BELOW = 160

/** Where the list goes, in the window: fixed, so a dialog's edge can't cut it off. */
export type Placement = {
  right: number
  minWidth: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function placeBy(trigger: HTMLElement): Placement {
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
