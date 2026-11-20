import type { DescriptionPiece, DescriptionSource } from '../../../api/tasks.ts'

type Generate = Extract<DescriptionSource, { mode: 'generate' }>

export type DescriptionChoice = {
  mode: 'keep' | 'generate' | 'lines'
  pieces: DescriptionPiece[]
  language: Generate['language']
  length: Generate['length']
  lines: string
}

export const PIECES: DescriptionPiece[] = [
  'greeting',
  'about',
  'games',
  'status',
  'quote',
  'tradeNote',
  'ascii',
  'kaomoji',
  'divider',
]

export const MODES = ['keep', 'generate', 'lines'] as const
export const LANGUAGES = ['mixed', 'english', 'russian'] as const
export const LENGTHS = ['short', 'medium', 'long'] as const

export const KEEP_DESCRIPTION: DescriptionChoice = {
  mode: 'keep',
  pieces: PIECES,
  language: 'mixed',
  length: 'medium',
  lines: '',
}

/** What the task sends, or `null` to keep each account's description. */
export function descriptionSource(
  choice: DescriptionChoice,
): DescriptionSource | null {
  switch (choice.mode) {
    case 'keep':
      return null
    case 'generate':
      return {
        mode: 'generate',
        pieces: choice.pieces,
        language: choice.language,
        length: choice.length,
      }
    case 'lines':
      return { mode: 'lines', lines: choice.lines }
  }
}

/** Whether the choice gives every account a description. */
export function describes(choice: DescriptionChoice) {
  if (choice.mode === 'generate') {
    return choice.pieces.some((piece) => piece !== 'divider')
  }
  return choice.mode === 'lines' && choice.lines.trim() !== ''
}
