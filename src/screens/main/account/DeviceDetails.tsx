import type { ReactNode } from 'react'
import { DEVICE_KIND_NAMES, type Device } from '../../../api/security.ts'
import { ago } from '../../../lib/ago.ts'
import styles from './AccountPage.module.css'

type Props = {
  device: Device
  /** Buttons next to the time, like Rename and Sign out. */
  children?: ReactNode
}

/** What a device is, where it was and when, for a row in a list of them. */
export default function DeviceDetails({ device, children }: Props) {
  const kind = DEVICE_KIND_NAMES[device.kind]
  const steamName = device.name || kind
  return (
    <>
      <span className={styles.deviceWords}>
        <span>
          {device.label ?? steamName}
          {device.thisApp && <span className={styles.muted}> · this app</span>}
        </span>
        <span className={styles.muted}>
          {[device.label && steamName, kind, device.place]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className={styles.deviceSide}>
        {device.lastSeenAt !== null && (
          <span className={styles.muted}>{ago(device.lastSeenAt)}</span>
        )}
        {children}
      </span>
    </>
  )
}
