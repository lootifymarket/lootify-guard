import { createContext, useContext } from 'react'

type StreamerState = {
  on: boolean
  /** Saves the choice, then blurs or shows what's private. */
  set: (on: boolean) => Promise<void>
}

export const StreamerContext = createContext<StreamerState>({
  on: false,
  set: async () => {},
})

export const useStreamerMode = () => useContext(StreamerContext)
