import { useEffect, useEffectEvent, useState } from 'react'
import {
  checkTradePartner,
  isOpen,
  type Known,
  type PartnerCheck,
  type TradeOffer,
} from '../../../api/trades.ts'
import { errorMessage } from '../../../api/vault.ts'

export type CheckResult = { check: PartnerCheck } | { error: string }

/** Looks up the sender of an open incoming offer once, when its row appears. */
export function usePartnerCheck(offer: TradeOffer, known: Known[]) {
  const [result, setResult] = useState<CheckResult | null>(null)
  const needed =
    !offer.sent && isOpen(offer.state) && offer.partnerAccount === null

  // The latest `known` is used, but a new list alone doesn't ask Steam again.
  const run = useEffectEvent(() =>
    checkTradePartner(offer, known).then(
      (check) => setResult({ check }),
      (err: unknown) => setResult({ error: errorMessage(err) }),
    ),
  )
  useEffect(() => {
    if (needed) void run()
  }, [needed, offer.accountName, offer.partnerId])

  return result
}
