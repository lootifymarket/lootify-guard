import { useEffect, useMemo, useState } from 'react'
import { lockVault, vaultStatus, type VaultStatus } from './api/vault.ts'
import {
  DICTIONARIES,
  LanguageContext,
  setWordsFor,
  type Language,
} from './i18n/index.ts'
import Main from './screens/main/Main.tsx'
import Onboarding from './screens/Onboarding.tsx'
import Unlock from './screens/unlock/Unlock.tsx'

type Props = {
  initialLanguage: Language
}

export default function App({ initialLanguage }: Props) {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [language, setLanguage] = useState(initialLanguage)
  const words = useMemo(
    () => ({ language, t: DICTIONARIES[language], setLanguage }),
    [language],
  )

  useEffect(() => {
    void vaultStatus().then(setStatus)
  }, [])

  useEffect(() => {
    setWordsFor(language)
    document.documentElement.lang = language
  }, [language])

  async function lock() {
    await lockVault()
    setStatus('locked')
  }

  function screen() {
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
    return (
      <Main
        onLock={() => void lock()}
        onAutoLocked={() => setStatus('locked')}
      />
    )
  }

  if (status === null) return null
  return (
    <LanguageContext.Provider value={words}>
      {screen()}
    </LanguageContext.Provider>
  )
}
