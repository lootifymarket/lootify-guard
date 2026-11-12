import { useEffect, useEffectEvent, useRef, useState } from 'react'
import jsQR from 'jsqr'
import Dropdown from './Dropdown.tsx'
import styles from './QrScanner.module.css'

type Props = {
  /** Called with the text of every QR code seen, until the scanner is removed. */
  onScan: (text: string) => void
}

const SCAN_EVERY_MS = 150
// Frames are scaled down to this width: plenty for a QR code, and much faster to read.
const SCAN_WIDTH = 640

/**
 * Reads QR codes from a camera. On a Mac, a nearby iPhone shows up as a camera
 * too (Continuity Camera), so it's in the list without any extra setup.
 */
export default function QrScanner({ onScan }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [requestedId, setRequestedId] = useState('')
  const [activeId, setActiveId] = useState('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [error, setError] = useState('')
  const scanned = useEffectEvent(onScan)

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function scan() {
      if (stopped) return
      const element = video.current
      if (context && element && element.videoWidth > 0) {
        const scale = Math.min(1, SCAN_WIDTH / element.videoWidth)
        canvas.width = Math.round(element.videoWidth * scale)
        canvas.height = Math.round(element.videoHeight * scale)
        context.drawImage(element, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) scanned(code.data)
      }
      timer = setTimeout(scan, SCAN_EVERY_MS)
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: requestedId ? { deviceId: { exact: requestedId } } : true,
          audio: false,
        })
      } catch (err) {
        if (!stopped) setError(cameraError(err))
        return
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.current.srcObject = stream
      await video.current.play()
      // Device names are only given out once access has been granted.
      const devices = await navigator.mediaDevices.enumerateDevices()
      if (stopped) return
      setCameras(devices.filter((device) => device.kind === 'videoinput'))
      setActiveId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
      setError('')
      scan()
    }

    void start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [requestedId])

  return (
    <div className={styles.scanner}>
      <div className={styles.frame}>
        <video ref={video} className={styles.video} muted playsInline />
        {error && <p className={styles.error}>{error}</p>}
      </div>
      {cameras.length > 1 && (
        <Dropdown
          label="Camera"
          size="sm"
          value={activeId}
          options={cameras.map((camera, index) => ({
            value: camera.deviceId,
            label: camera.label || `Camera ${index + 1}`,
          }))}
          onChange={setRequestedId}
        />
      )}
      <span className={styles.hint}>
        Hold the QR code up to the camera. On a Mac, an iPhone nearby can be
        picked as a camera too.
      </span>
    </div>
  )
}

function cameraError(err: unknown) {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') {
    return 'Camera access is off. Turn it on for Lootify Guard in your system’s privacy settings.'
  }
  if (name === 'NotFoundError') return 'No camera found.'
  return 'Couldn’t start the camera.'
}
