import { useEffect, useRef, useState } from 'react'
import { CODE_PERIOD_SECS, type Account } from '../../../api/accounts.ts'
import {
  bookmarkPage,
  browserBack,
  browserForward,
  browserNavigate,
  browserReload,
  browserSnapshot,
  browserState,
  hideBrowser,
  listBookmarks,
  openBrowser,
  placeBrowser,
  removeBookmark,
  type Bookmark,
  type Bounds,
  type BrowserState,
} from '../../../api/browser.ts'
import {
  listConfirmations,
  respondToConfirmations,
  type Confirmation,
} from '../../../api/confirmations.ts'
import { proxyTitle, type Proxy } from '../../../api/proxies.ts'
import { errorMessage } from '../../../api/vault.ts'
import Icon from '../../../components/Icon.tsx'
import Private from '../../../components/Private.tsx'
import Skeleton from '../../../components/Skeleton.tsx'
import { useT } from '../../../i18n/index.ts'
import { ago } from '../../../lib/ago.ts'
import { MASK } from '../../../lib/streamer.ts'
import { useToast } from '../../../lib/toast.ts'
import { useCodeSecondsLeft } from '../useAccounts.ts'
import lootifyMarketIcon from '../../../assets/lootify-market.png'
import steamIcon from '../../../assets/steam.png'
import styles from './BrowserTab.module.css'

const BACK_ICON = 'M15 18l-6-6 6-6'
const FORWARD_ICON = 'M9 18l6-6-6-6'
const RELOAD_ICON = 'M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10'
const LOCK_ICON = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
const STAR_ICON =
  'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'
const PIN_ICON = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
// Always on the bar and never removed: the two sites the app is for.
const PINNED = [
  {
    id: 'steam',
    title: 'Steam',
    url: 'https://store.steampowered.com/',
    icon: steamIcon,
  },
  {
    id: 'lootify',
    title: 'Lootify Market',
    url: 'https://lootify.market/',
    icon: lootifyMarketIcon,
  },
] as const
const SHIELD_ICON = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
// The address and the spinner follow the page closely; Steam is the slow part.
const STATE_EVERY_MS = 400
const CONFIRMATIONS_EVERY_MS = 30_000

/** Where the element is in the window's page. */
function boundsOf(element: HTMLElement): Bounds {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** The icon the app has of its own for the sites it's for, or `null`. */
function builtInIcon(address: string) {
  const host = new URL(address).hostname
  if (host === 'steamcommunity.com' || host.endsWith('steampowered.com')) {
    return steamIcon
  }
  return host === 'lootify.market' || host.endsWith('.lootify.market')
    ? lootifyMarketIcon
    : null
}

/** The site's own icon, else the app's for the sites it knows, else a letter. */
function BookmarkIcon({ bookmark }: { bookmark: Bookmark }) {
  const icon = bookmark.icon ?? builtInIcon(bookmark.url)
  if (icon) return <img className={styles.siteIcon} src={icon} alt="" />
  return (
    <span className={styles.letter} aria-hidden="true">
      {bookmark.title.slice(0, 1).toUpperCase()}
    </span>
  )
}

type Props = {
  account: Account
  proxy: Proxy | null
  codesExpireAt: number
  /** Something of the app's is drawn over the page, so the page steps aside. */
  covered: boolean
  onClose: () => void
}

/**
 * Steam in the app, signed in as the account. The page itself is a webview the
 * backend lays over the page area, so this only keeps it in place.
 */
export default function BrowserTab({
  account,
  proxy,
  codesExpireAt,
  covered,
  onClose,
}: Props) {
  const words = useT()
  const t = words.browser
  const name = account.accountName
  const area = useRef<HTMLDivElement>(null)
  const [opened, setOpened] = useState(false)
  // Read by callbacks that outlive the render they were made in.
  const coveredNow = useRef(covered)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [badAddress, setBadAddress] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [bookmarkError, setBookmarkError] = useState<string | null>(null)
  const [savingBookmark, setSavingBookmark] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<BrowserState | null>(null)
  // Closed until asked for: the code and confirmations stay off screen by default.
  const [panel, setPanel] = useState(false)
  const [confirmations, setConfirmations] = useState<Confirmation[]>([])
  const [confirmationsError, setConfirmationsError] = useState<string | null>(
    null,
  )
  const [answering, setAnswering] = useState<string | null>(null)
  const [confirmationsVersion, setConfirmationsVersion] = useState(0)
  const toast = useToast()
  const secondsLeft = useCodeSecondsLeft(codesExpireAt)

  useEffect(() => {
    const element = area.current
    if (!element) return
    let active = true
    let shown = false
    openBrowser(name, boundsOf(element)).then(
      () => {
        // Left, or covered, before Steam answered: the page shouldn't cover what's here now.
        if (!active || coveredNow.current) void hideBrowser(name)
        if (!active) return
        shown = true
        setOpened(true)
        setError(null)
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err))
      },
    )
    const observer = new ResizeObserver(() => {
      if (shown && !coveredNow.current)
        void placeBrowser(name, boundsOf(element))
    })
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
      void hideBrowser(name)
    }
  }, [name, attempt])

  // The page is drawn by the system over the app, so nothing of the app's can
  // go over it. While something does, a picture of it stands in its place.
  useEffect(() => {
    coveredNow.current = covered
    const element = area.current
    if (!opened || !element) return
    let active = true
    if (covered) {
      browserSnapshot(name)
        .then(
          (picture) => {
            if (active) setSnapshot(picture)
          },
          () => {},
        )
        .finally(() => {
          // Hidden once the picture is on screen, so nothing flickers.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (active) void hideBrowser(name)
            }),
          )
        })
    } else {
      placeBrowser(name, boundsOf(element)).then(
        () => {
          if (active) setSnapshot(null)
        },
        () => {},
      )
    }
    return () => {
      active = false
    }
  }, [name, covered, opened])

  useEffect(() => {
    if (!opened) return
    let active = true
    const read = () =>
      browserState(name).then(
        (next) => {
          if (active) setState(next)
        },
        () => {},
      )
    void read()
    const timer = setInterval(() => void read(), STATE_EVERY_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [name, opened])

  useEffect(() => {
    let active = true
    const read = () =>
      listConfirmations(name).then(
        (next) => {
          if (!active) return
          setConfirmations(next)
          setConfirmationsError(null)
        },
        (err: unknown) => {
          if (active) setConfirmationsError(errorMessage(err))
        },
      )
    void read()
    const timer = setInterval(() => void read(), CONFIRMATIONS_EVERY_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [name, confirmationsVersion])

  async function answer(confirmation: Confirmation, accept: boolean) {
    setAnswering(confirmation.id)
    try {
      await respondToConfirmations(name, [confirmation], accept)
      toast(accept ? t.confirmed : t.declined)
      setConfirmations((list) =>
        list.filter((each) => each.id !== confirmation.id),
      )
    } catch (err) {
      setConfirmationsError(errorMessage(err))
    } finally {
      setAnswering(null)
      setConfirmationsVersion((version) => version + 1)
    }
  }

  useEffect(() => {
    let active = true
    listBookmarks().then(
      (next) => {
        if (active) setBookmarks(next)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [])

  async function changeBookmarks(change: Promise<Bookmark[]>) {
    setSavingBookmark(true)
    try {
      setBookmarks(await change)
      setBookmarkError(null)
    } catch (err) {
      setBookmarkError(errorMessage(err))
    } finally {
      setSavingBookmark(false)
    }
  }

  async function go(address: string) {
    try {
      await browserNavigate(name, address)
      setDraft(null)
    } catch {
      setBadAddress(true)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(account.code)
      toast(words.common.copied)
    } catch {
      toast(words.common.copyFailed)
    }
  }

  const url = state?.url ? new URL(state.url) : null
  const pinnedHere = PINNED.some((pinned) => pinned.url === state?.url)
  const savedHere = bookmarks.find((saved) => saved.url === state?.url)
  const starTip = pinnedHere
    ? t.pinnedHere
    : savedHere
      ? t.unbookmark
      : t.bookmarkThis
  const loading = !error && (!opened || (state?.loading ?? true))
  const bar = `${(secondsLeft / CODE_PERIOD_SECS) * 100}%`
  const proxyName = proxy ? proxyTitle(proxy) : t.noProxy
  const since = state ? ago(state.openedAt) : null

  return (
    <div className={styles.browser}>
      <div className={styles.chrome}>
        <button
          type="button"
          className={styles.icon}
          aria-label={t.back}
          aria-disabled={!state?.canGoBack}
          onClick={() => state?.canGoBack && void browserBack(name)}
        >
          <Icon path={BACK_ICON} size={16} stroke={2} />
        </button>
        <button
          type="button"
          className={styles.icon}
          aria-label={t.forward}
          aria-disabled={!state?.canGoForward}
          onClick={() => state?.canGoForward && void browserForward(name)}
        >
          <Icon path={FORWARD_ICON} size={16} stroke={2} />
        </button>
        <button
          type="button"
          className={styles.icon}
          aria-label={t.reload}
          aria-disabled={!opened}
          onClick={() => opened && void browserReload(name)}
        >
          <Icon path={RELOAD_ICON} size={15} stroke={2} />
        </button>
        <form
          className={styles.address}
          data-invalid={badAddress}
          onSubmit={(event) => {
            event.preventDefault()
            if (draft !== null) void go(draft)
          }}
        >
          <span className={styles.lock}>
            <Icon path={LOCK_ICON} size={13} stroke={2.2} />
          </span>
          {draft === null ? (
            <button
              type="button"
              className={styles.url}
              aria-label={t.address}
              disabled={!opened}
              onClick={() => setDraft(state?.url ?? '')}
            >
              {url && (
                <>
                  <span className={styles.host}>{url.hostname}</span>
                  <span className={styles.path}>
                    <Private mask="/…">{url.pathname + url.search}</Private>
                  </span>
                </>
              )}
            </button>
          ) : (
            <input
              // Opened by a click on the address, so the caret goes where it was asked for.
              autoFocus
              className={styles.input}
              aria-label={t.address}
              data-private
              value={draft}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                setDraft(event.target.value)
                setBadAddress(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setDraft(null)
              }}
              onBlur={() => {
                setDraft(null)
                setBadAddress(false)
              }}
            />
          )}
          <button
            type="button"
            className={styles.star}
            aria-pressed={pinnedHere || savedHere !== undefined}
            aria-label={starTip}
            title={starTip}
            disabled={!url || pinnedHere || savingBookmark}
            onClick={() =>
              void changeBookmarks(
                savedHere ? removeBookmark(savedHere.url) : bookmarkPage(name),
              )
            }
          >
            <Icon path={STAR_ICON} size={15} stroke={1.9} />
          </button>
        </form>
        <span
          className={styles.badge}
          title={proxy ? t.proxyHint : t.directHint}
          data-direct={!proxy}
        >
          <span className={styles.badgeDot} />
          <span className={styles.badgeText}>
            <Private>{proxyName}</Private>
          </span>
        </span>
        <button
          type="button"
          className={styles.guardToggle}
          aria-pressed={panel}
          onClick={() => setPanel(!panel)}
        >
          <Icon path={SHIELD_ICON} size={15} stroke={1.9} />
          {t.guard}
          {confirmations.length > 0 && (
            <span className={styles.count}>{confirmations.length}</span>
          )}
        </button>
      </div>

      <nav className={styles.bookmarks} aria-label={t.bookmarks}>
        {PINNED.map((pinned) => (
          <span
            key={pinned.id}
            className={styles.bookmark}
            data-current={pinned.url === state?.url}
          >
            <button
              type="button"
              className={styles.bookmarkOpen}
              title={`${pinned.title} · ${t.pinned}`}
              disabled={!opened}
              onClick={() => void browserNavigate(name, pinned.url)}
            >
              <img className={styles.siteIcon} src={pinned.icon} alt="" />
              {pinned.title}
              <span className={styles.pin}>
                <Icon path={PIN_ICON} size={10} stroke={2.4} />
              </span>
            </button>
          </span>
        ))}
        {bookmarks.map((saved) => (
          <span
            key={saved.url}
            className={styles.bookmark}
            data-current={saved.url === state?.url}
          >
            <button
              type="button"
              className={styles.bookmarkOpen}
              title={saved.url}
              disabled={!opened}
              onClick={() => void browserNavigate(name, saved.url)}
            >
              <BookmarkIcon bookmark={saved} />
              {saved.title}
            </button>
            <button
              type="button"
              className={styles.bookmarkRemove}
              aria-label={`${t.removeBookmark} ${saved.title}`}
              title={t.removeBookmark}
              onClick={() => void changeBookmarks(removeBookmark(saved.url))}
            >
              ×
            </button>
          </span>
        ))}
        {bookmarkError && (
          <span className={styles.bookmarkError} role="alert">
            {bookmarkError}
          </span>
        )}
        {loading && <span className={styles.loading} />}
      </nav>

      <div className={styles.body}>
        <div ref={area} className={styles.page}>
          {snapshot && (
            <img className={styles.snapshot} src={snapshot} alt="" />
          )}
          {error ? (
            <div className={`${styles.failed} rise`} role="alert">
              <p className={styles.failedText}>{error}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  setError(null)
                  setAttempt((n) => n + 1)
                }}
              >
                {t.tryAgain}
              </button>
            </div>
          ) : (
            !opened && (
              <div
                className={styles.placeholder}
                role="status"
                aria-label={t.signingIn}
              >
                <Skeleton height={120} />
                <Skeleton width="40%" height={18} />
                <Skeleton height={260} />
              </div>
            )
          )}
        </div>

        {/* Always there, so it can slide in and out; the page narrows with it. */}
        <div className={styles.panelSlot} data-open={panel} inert={!panel}>
          <aside className={styles.panel} aria-label={t.guardPanel}>
            <div className={styles.panelCode}>
              <span className={styles.label}>
                {words.guard.title} · {name}
              </span>
              <button
                type="button"
                className={styles.bigCode}
                title={t.copyCode}
                onClick={() => void copyCode()}
              >
                <Private mask={MASK.code}>{account.code}</Private>
              </button>
              <span className={styles.panelBar}>
                <span className={styles.codeBarFill} style={{ width: bar }} />
              </span>
            </div>

            <div className={styles.section}>
              <span className={styles.label}>
                {t.confirmations(confirmations.length)}
              </span>
              {confirmationsError && (
                <p className={styles.error} role="alert">
                  {confirmationsError}
                </p>
              )}
              {confirmations.length === 0 && (
                <span className={styles.nothing}>{t.nothingToConfirm}</span>
              )}
              {confirmations.map((confirmation) => (
                <div key={confirmation.id} className={`${styles.item} rise`}>
                  <span className={styles.itemText}>
                    <span className={styles.itemTitle}>
                      {confirmation.headline}
                    </span>
                    {confirmation.summary.length > 0 && (
                      <span className={styles.itemSummary}>
                        {confirmation.summary.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.confirm}
                      disabled={answering !== null}
                      onClick={() => void answer(confirmation, true)}
                    >
                      {t.confirm}
                    </button>
                    <button
                      type="button"
                      className={styles.decline}
                      disabled={answering !== null}
                      onClick={() => void answer(confirmation, false)}
                    >
                      {t.decline}
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.section}>
              <span className={styles.label}>{t.session}</span>
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>{t.proxy}</dt>
                  <dd>
                    <Private>{proxyName}</Private>
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>{t.cookies}</dt>
                  <dd>{t.cookiesIsolated}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>{t.signedIn}</dt>
                  <dd>
                    {since === null
                      ? '—'
                      : since === words.time.justNow
                        ? since
                        : t.signedInAgo(since)}
                  </dd>
                </div>
              </dl>
              <button type="button" className={styles.end} onClick={onClose}>
                {t.endSession}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
