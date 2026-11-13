import { warningText, type TradeOffer } from '../../../api/trades.ts'
import Button from '../../../components/Button.tsx'
import Dialog from '../../../components/Dialog.tsx'
import dialogStyles from '../../../components/Dialog.module.css'
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
  const check = result && 'check' in result ? result.check : null
  const copied = check?.warnings.find(
    (warning) => warning.kind === 'copiesName',
  )
  return (
    <Dialog
      open={open}
      title={check?.name ?? offer.partnerName ?? 'Trade partner'}
      onClose={onClose}
    >
      {result && 'error' in result && (
        <p className={dialogStyles.error} role="alert">
          {result.error}
        </p>
      )}
      {copied && (
        <p className={styles.scam}>
          This account copies the name of {copied.of}, someone you trade with,
          from a different Steam account. That’s how trade swap scams work:
          don’t send it anything.
        </p>
      )}
      {check && (
        <dl className={styles.facts}>
          <div>
            <dt>Account age</dt>
            <dd>
              {check.ageDays === null ? 'Hidden' : `${check.ageDays} days`}
            </dd>
          </div>
          <div>
            <dt>Steam level</dt>
            <dd>{check.level ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Trades with you this week</dt>
            <dd>{pastTrades === 0 ? 'None' : pastTrades}</dd>
          </div>
          <div>
            <dt>Steam ID</dt>
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
      {!result && <p className={dialogStyles.text}>Asking Steam…</p>}
      <div className={dialogStyles.actions}>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  )
}
