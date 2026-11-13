import { useEffect, useMemo, useState } from 'react'
import { setStreamerMode, showStreamerMode } from './api/settings.ts'
import { lockVault, vaultStatus, type VaultStatus } from './api/vault.ts'
import Toasts from './components/Toasts.tsx'
import {
  DICTIONARIES,
  LanguageContext,
  setWordsFor,
  type Language,
} from './i18n/index.ts'
import { StreamerContext } from './lib/streamer.ts'
import Main from './screens/main/Main.tsx'
import Onboarding from './screens/Onboarding.tsx'
import Splash from './screens/Splash.tsx'
import Unlock from './screens/unlock/Unlock.tsx'

type Props = {
  initialLanguage: Language
  initialStreamer: boolean
}

// With reduced motion asked for, there's nothing to watch, so it's skipped.
const SKIP_SPLASH = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches

export default function App({ initialLanguage, initialStreamer }: Props) {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [splashed, setSplashed] = useState(SKIP_SPLASH)
  const [language, setLanguage] = useState(initialLanguage)
  const [streamer, setStreamer] = useState(initialStreamer)
  const words = useMemo(
    () => ({ language, t: DICTIONARIES[language], setLanguage }),
    [language],
  )
  const streamerMode = useMemo(
    () => ({
      on: streamer,
      set: (on: boolean) => setStreamerMode(on).then(() => setStreamer(on)),
    }),
    [streamer],
  )

  useEffect(() => {
    void vaultStatus().then(setStatus)
  }, [])

  useEffect(() => {
    setWordsFor(language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => showStreamerMode(streamer), [streamer])

  async function lock() {
    await lockVault()
    setStatus('locked')
  }

  function screen() {
    if (!splashed) {
      return <Splash ready={status !== null} onDone={() => setSplashed(true)} />
    }
    if (status === 'missing') {
      return <Onboarding onCreated={() => setStatus('unlocked')} />
    }
    if (status === 'locked') {
      return (
        <Unlock
          onUnlocked={() => setStatus('unlocked')}
          onErased={() => setStatus('missing')}
        />
      )
    }
    if (status === null) return null
    return (
      <Main
        onLock={() => void lock()}
        onAutoLocked={() => setStatus('locked')}
      />
    )
  }

  return (
    <LanguageContext.Provider value={words}>
      <StreamerContext.Provider value={streamerMode}>
        <Toasts>{screen()}</Toasts>
      </StreamerContext.Provider>
    </LanguageContext.Provider>
  )
}
