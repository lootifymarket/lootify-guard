import { DEVICE_KIND_NAMES, type Device } from '../../../api/security.ts'
import { ago } from '../../../lib/ago.ts'
import styles from './AccountPage.module.css'

/** What a device is, where it was and when, for a row in a list of them. */
export default function DeviceDetails({ device }: { device: Device }) {
  return (
    <>
      <span className={styles.deviceWords}>
        <span>
          {device.name || DEVICE_KIND_NAMES[device.kind]}
          {device.thisApp && <span className={styles.muted}> · this app</span>}
        </span>
        <span className={styles.muted}>
          {[DEVICE_KIND_NAMES[device.kind], device.place]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {device.lastSeenAt !== null && (
        <span className={styles.muted}>{ago(device.lastSeenAt)}</span>
      )}
    </>
  )
}
