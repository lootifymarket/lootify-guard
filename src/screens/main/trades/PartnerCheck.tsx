import { warningText, type TradeOffer } from '../../../api/trades.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
import { useT } from '../../../i18n/index.ts'
import styles from './Trades.module.css'
import type { CheckResult } from './usePartnerCheck.ts'

type DialogProps = {
  open: boolean
  offer: TradeOffer
  result: CheckResult | null
  pastTrades: number
  onClose: () => void
}

export default function PartnerDialog({
  open,
  offer,
  result,
  pastTrades,
  onClose,
}: DialogProps) {
  const trades = useT().trades
  const t = trades.partner
  const check = result && 'check' in result ? result.check : null
  const copied = check?.warnings.find(
    (warning) => warning.kind === 'copiesName',
  )
  return (
    <Dialog
      open={open}
      title={check?.name ?? offer.partnerName ?? t.title}
      onClose={onClose}
    >
      {result && 'error' in result && (
        <p className={dialogStyles.error} role="alert">
          {result.error}
        </p>
      )}
      {copied && <p className={styles.scam}>{t.copiesName(copied.of)}</p>}
      {check && (
        <dl className={styles.facts}>
          <div>
            <dt>{t.accountAge}</dt>
            <dd>{check.ageDays === null ? t.hidden : t.days(check.ageDays)}</dd>
          </div>
          <div>
            <dt>{t.level}</dt>
            <dd>{check.level ?? t.unknown}</dd>
          </div>
          <div>
            <dt>{t.tradesThisWeek}</dt>
            <dd>{pastTrades === 0 ? t.none : pastTrades}</dd>
          </div>
          <div>
            <dt>{t.steamId}</dt>
            <dd className={styles.mono}>{offer.partnerId}</dd>
          </div>
        </dl>
      )}
      {check && check.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {check.warnings.map((warning) => (
            <li key={warning.kind}>{warningText(warning)}</li>
          ))}
        </ul>
      )}
      {!result && <p className={dialogStyles.text}>{trades.askingSteam}</p>}
      <div className={dialogStyles.actions}>
        <Button size="sm" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    </Dialog>
  )
}
