import { useEffect, useId, useState } from 'react'
import {
  descriptionSamples,
  type DescriptionPiece,
  type DescriptionSource,
} from '../../../api/tasks.ts'
import { errorMessage } from '../../../api/vault.ts'
import Button from '../../../components/Button.tsx'
import Dropdown from '../../../components/Dropdown.tsx'
import Icon from '../../../components/Icon.tsx'
import { useT } from '../../../i18n/index.ts'
import { DICE_ICON } from '../dice.ts'
import {
  descriptionSource,
  LANGUAGES,
  LENGTHS,
  MODES,
  PIECES,
  type DescriptionChoice,
} from './description.ts'
import styles from './Tasks.module.css'

type Props = {
  choice: DescriptionChoice
  onChange: (choice: DescriptionChoice) => void
}

/** How a Profile task writes each account's description. */
export default function DescriptionOptions({ choice, onChange }: Props) {
  const t = useT().tasks.profile
  const linesId = useId()
  const set = (patch: Partial<DescriptionChoice>) =>
    onChange({ ...choice, ...patch })
  const source = descriptionSource(choice)

  function toggle(piece: DescriptionPiece) {
    const on = choice.pieces.includes(piece)
    set({
      pieces: PIECES.filter((known) =>
        known === piece ? !on : choice.pieces.includes(known),
      ),
    })
  }

  return (
    <div className={styles.optionGroup}>
      <Dropdown
        label={t.description}
        size="sm"
        value={choice.mode}
        options={MODES.map((mode) => ({
          value: mode,
          label: t.descriptionModes[mode],
        }))}
        onChange={(mode) => set({ mode: mode as DescriptionChoice['mode'] })}
      />

      {choice.mode === 'generate' && (
        <>
          <div
            className={styles.pieces}
            role="group"
            aria-label={t.piecesLabel}
          >
            {PIECES.map((piece) => (
              <button
                key={piece}
                type="button"
                className={styles.piece}
                aria-pressed={choice.pieces.includes(piece)}
                onClick={() => toggle(piece)}
              >
                {t.pieces[piece]}
              </button>
            ))}
          </div>
          <div className={styles.pair}>
            <Dropdown
              label={t.language}
              size="sm"
              value={choice.language}
              options={LANGUAGES.map((language) => ({
                value: language,
                label: t.languages[language],
              }))}
              onChange={(language) =>
                set({ language: language as DescriptionChoice['language'] })
              }
            />
            <Dropdown
              label={t.length}
              size="sm"
              value={choice.length}
              options={LENGTHS.map((length) => ({
                value: length,
                label: t.lengths[length],
              }))}
              onChange={(length) =>
                set({ length: length as DescriptionChoice['length'] })
              }
            />
          </div>
          <p className={styles.note}>{t.generateNote}</p>
        </>
      )}

      {choice.mode === 'lines' && (
        <>
          <label htmlFor={linesId} className={styles.fieldLabel}>
            {t.myLines}
          </label>
          <textarea
            id={linesId}
            className={styles.textarea}
            rows={4}
            spellCheck={false}
            placeholder={t.linesPlaceholder}
            value={choice.lines}
            onChange={(event) => set({ lines: event.target.value })}
          />
          <p className={styles.note}>{t.linesNote}</p>
        </>
      )}

      {source && <Samples source={source} />}
    </div>
  )
}

function Samples({ source }: { source: DescriptionSource }) {
  const t = useT().tasks.profile
  const [samples, setSamples] = useState<string[]>([])
  const [problem, setProblem] = useState('')
  const [round, setRound] = useState(0)
  // A new object comes with every render; its text says whether it changed.
  const key = JSON.stringify(source)

  useEffect(() => {
    let live = true
    // Lines are typed a key at a time, and only the last one matters.
    const timer = setTimeout(() => {
      descriptionSamples(JSON.parse(key) as DescriptionSource).then(
        (texts) => {
          if (!live) return
          setSamples(texts)
          setProblem('')
        },
        (err: unknown) => {
          if (!live) return
          setSamples([])
          setProblem(errorMessage(err))
        },
      )
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [key, round])

  return (
    <div className={styles.samples}>
      <div className={styles.samplesHead}>
        <span className={styles.fieldLabel}>{t.examples}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRound((count) => count + 1)}
        >
          <Icon path={DICE_ICON} size={14} stroke={1.9} />
          {t.shuffle}
        </Button>
      </div>
      {problem ? (
        <p className={styles.sampleProblem}>{problem}</p>
      ) : (
        samples.map((text, index) => (
          <pre key={index} className={styles.sample}>
            {text}
          </pre>
        ))
      )}
    </div>
  )
}
