import { useEffect, useState } from 'react'
import { lockVault, vaultStatus, type VaultStatus } from './api/vault.ts'
import Main from './screens/main/Main.tsx'
import Onboarding from './screens/Onboarding.tsx'
import Unlock from './screens/unlock/Unlock.tsx'

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null)

  useEffect(() => {
    void vaultStatus().then(setStatus)
  }, [])

  async function lock() {
    await lockVault()
    setStatus('locked')
  }

  if (status === null) return null
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
    <Main onLock={() => void lock()} onAutoLocked={() => setStatus('locked')} />
  )
}
