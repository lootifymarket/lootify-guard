import { useCallback, useEffect, useState } from 'react'
import {
  BIOMETRIC_NAMES,
  biometricStatus,
  type BiometricStatus,
} from '../../api/vault.ts'
import Lockup from '../../components/Lockup.tsx'
import RecoverPassword from './RecoverPassword.tsx'
import ResetVault from './ResetVault.tsx'
import UnlockForm from './UnlockForm.tsx'
import styles from './Unlock.module.css'

type Props = {
  onUnlocked: () => void
  onErased: () => void
}

export default function Unlock({ onUnlocked, onErased }: Props) {
  const [view, setView] = useState<'unlock' | 'recover' | 'reset'>('unlock')
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null)

  const refreshBiometric = useCallback(() => {
    void biometricStatus().then(setBiometric)
  }, [])
  useEffect(refreshBiometric, [refreshBiometric])

  const name = biometric?.method ? BIOMETRIC_NAMES[biometric.method] : null
  const enrolledName = biometric?.enrolled ? name : null

  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <Lockup />
        {view === 'unlock' && (
          <UnlockForm
            biometricName={enrolledName}
            onUnlocked={onUnlocked}
            onForgot={() => setView(enrolledName ? 'recover' : 'reset')}
            onBiometricsOutdated={refreshBiometric}
          />
        )}
        {view === 'recover' && name && (
          <RecoverPassword
            biometricName={name}
            onUnlocked={onUnlocked}
            onBack={() => setView('unlock')}
            onUnavailable={() => setView('reset')}
            onBiometricsOutdated={refreshBiometric}
          />
        )}
        {view === 'reset' && (
          <ResetVault
            biometricName={enrolledName}
            onErased={onErased}
            onBack={() => setView('unlock')}
          />
        )}
        <p className={styles.footnote}>
          Your data is encrypted and stored only on this device.
        </p>
      </div>
    </div>
  )
}
