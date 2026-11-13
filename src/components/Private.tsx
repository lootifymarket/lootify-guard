import type { ReactNode } from 'react'
import { MASK, useStreamerMode } from '../lib/streamer.ts'

type Props = {
  mask?: string
  children: ReactNode
}

/**
 * Something that could identify an account or help rob it, like a Guard code
 * or a balance. In streamer mode it's replaced by dots.
 */
export default function Private({ mask = MASK.text, children }: Props) {
  return useStreamerMode().on ? mask : children
}
