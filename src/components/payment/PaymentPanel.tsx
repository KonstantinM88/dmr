'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCents } from '@/lib/money';
import type { BillView } from '@/domains/billing/shared/types';
import type {
  StartCashPaymentResult,
  StartPaymentResult,
} from '@/domains/payments/shared/types';
import { WaitingDuration } from '@/components/service/WaitingDuration';

type PaymentStartFailureReason =
  | Extract<StartPaymentResult, { ok: false }>['reason']
  | Extract<StartCashPaymentResult, { ok: false }>['reason'];

type Props = {
  publishableKey: string;
  stripeAvailable: boolean;
  locale: string;
  currency: string;
  remainingCents: number;
  lines: BillView['lines'];
  activeAttempt: BillView['activeAttempt'];
  returnUrl: string;
  startAction: (selectedItemIds: string[]) => Promise<StartPaymentResult>;
  startCashAction: (selectedItemIds: string[]) => Promise<StartCashPaymentResult>;
  cancelAction: (attemptId: string) => Promise<{ ok: true }>;
};

export function PaymentPanel(props: Props) {
  const t = useTranslations('payment');
  const initialIds = props.activeAttempt?.selectedItemIds.length
    ? props.activeAttempt.selectedItemIds
    : props.lines.map((line) => line.orderItemId);
  const [selected, setSelected] = useState(() => new Set(initialIds));
  const [active, setActive] = useState(props.activeAttempt);
  const [stripeSession, setStripeSession] = useState<{
    clientSecret: string;
    attemptId: string;
    amountCents: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedAmount = props.lines
    .filter((line) => selected.has(line.orderItemId))
    .reduce((sum, line) => sum + line.remainingCents, 0);
  const stripePromise = useMemo(
    () => (props.stripeAvailable ? loadStripe(props.publishableKey) : null),
    [props.publishableKey, props.stripeAvailable],
  );

  const showFailure = useCallback(
    (reason: PaymentStartFailureReason) => {
      const key =
        reason === 'invalid_selection'
          ? 'selectAtLeastOne'
          : reason === 'attempt_in_progress'
            ? 'anotherPaymentPending'
            : reason === 'rate_limited'
              ? 'tooManyAttempts'
              : reason === 'provider_unavailable'
                ? 'providerUnavailable'
                : reason === 'nothing_to_pay'
                  ? 'nothingToPay'
                  : reason === 'session_not_payable'
                    ? 'sessionClosed'
                    : 'startFailed';
      setError(t(key));
    },
    [t],
  );

  const beginCard = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await props.startAction(selectedIds);
      if (!result.ok) return showFailure(result.reason);
      setActive({
        id: result.attemptId,
        method: 'STRIPE',
        status: 'PENDING',
        amountCents: result.amountCents,
        createdAt: new Date().toISOString(),
        selectedItemIds: selectedIds,
        allocations: props.lines
          .filter((line) => selectedIds.includes(line.orderItemId))
          .map((line) => ({
            orderItemId: line.orderItemId,
            quantity: line.remainingQuantity,
            amountCents: line.remainingCents,
          })),
      });
      setStripeSession({
        clientSecret: result.clientSecret,
        attemptId: result.attemptId,
        amountCents: result.amountCents,
      });
    });
  }, [props, selectedIds, showFailure]);

  const beginCash = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await props.startCashAction(selectedIds);
      if (!result.ok) return showFailure(result.reason);
      setActive({
        id: result.attemptId,
        method: 'CASH',
        status: 'PENDING',
        amountCents: result.amountCents,
        createdAt: new Date().toISOString(),
        selectedItemIds: selectedIds,
        allocations: props.lines
          .filter((line) => selectedIds.includes(line.orderItemId))
          .map((line) => ({
            orderItemId: line.orderItemId,
            quantity: line.remainingQuantity,
            amountCents: line.remainingCents,
          })),
      });
    });
  }, [props, selectedIds, showFailure]);

  if (stripeSession && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: stripeSession.clientSecret,
          locale: props.locale === 'ru' ? 'ru' : 'de',
          appearance: { theme: 'night', variables: { colorPrimary: '#c79a45' } },
        }}
      >
        <CheckoutForm
          attemptId={stripeSession.attemptId}
          returnUrl={props.returnUrl}
          amountLabel={formatCents(stripeSession.amountCents, props.locale, props.currency)}
          cancelAction={props.cancelAction}
          onCancelled={() => {
            setStripeSession(null);
            setActive(null);
          }}
        />
      </Elements>
    );
  }

  if (active) {
    return (
      <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] p-4">
        <p className="text-sm text-[var(--color-brass)]">
          {active.method === 'CASH' ? t('cashRequested') : t('cardPending')}
        </p>
        <p className="mt-1 font-[family-name:var(--font-mono)] text-sm">
          {formatCents(active.amountCents, props.locale, props.currency)}
        </p>
        <WaitingDuration
          since={active.createdAt}
          prefix={t('waitTime')}
          className="mt-1 block text-xs text-[var(--color-paper-dim)]"
        />
        {active.method === 'STRIPE' && props.stripeAvailable && (
          <button
            type="button"
            disabled={isPending}
            onClick={beginCard}
            className="mt-4 w-full rounded-full bg-[var(--color-brass)] px-5 py-2.5 text-sm text-[var(--color-ink-950)] disabled:opacity-50"
          >
            {t('continueCard')}
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await props.cancelAction(active.id);
              setActive(null);
            })
          }
          className="mt-3 w-full rounded-full border border-[var(--color-ink-700)] px-5 py-2.5 text-sm text-[var(--color-paper-dim)] disabled:opacity-50"
        >
          {t('cancelRequest')}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{t('chooseItems')}</p>
        <button
          type="button"
          onClick={() => setSelected(new Set(props.lines.map((line) => line.orderItemId)))}
          className="text-xs text-[var(--color-brass)] underline underline-offset-4"
        >
          {t('selectAll')}
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {props.lines.map((line) => (
          <li key={line.orderItemId}>
            <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-3">
              <input
                type="checkbox"
                checked={selected.has(line.orderItemId)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(line.orderItemId);
                  else next.delete(line.orderItemId);
                  setSelected(next);
                }}
                className="size-4 accent-[var(--color-brass)]"
              />
              <span className="flex-1 text-sm text-[var(--color-paper-dim)]">
                {line.remainingQuantity} × {line.name}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-sm">
                {formatCents(line.remainingCents, props.locale, props.currency)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="pt-3 text-sm text-[var(--color-clay)]">{error}</p>}
      <p className="pt-4 text-sm">
        {t('selectedTotal')}: {formatCents(selectedAmount, props.locale, props.currency)}
      </p>
      <button
        type="button"
        onClick={beginCash}
        disabled={isPending || selectedAmount <= 0}
        className="mt-4 w-full rounded-full bg-[var(--color-brass)] px-5 py-3 font-medium text-[var(--color-ink-950)] disabled:opacity-50"
      >
        {isPending ? t('preparing') : t('payCash')}
      </button>
      <button
        type="button"
        onClick={beginCard}
        disabled={isPending || selectedAmount <= 0 || !props.stripeAvailable}
        className="mt-3 w-full rounded-full border border-[var(--color-brass)] px-5 py-3 text-sm text-[var(--color-brass)] disabled:border-[var(--color-ink-700)] disabled:text-[var(--color-paper-faint)]"
      >
        {t('payCard')}
      </button>
      {!props.stripeAvailable && (
        <p className="pt-2 text-xs text-[var(--color-paper-faint)]">{t('cardUnavailable')}</p>
      )}
    </div>
  );
}

function CheckoutForm(props: {
  attemptId: string;
  returnUrl: string;
  amountLabel: string;
  cancelAction: (attemptId: string) => Promise<{ ok: true }>;
  onCancelled: () => void;
}) {
  const t = useTranslations('payment');
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: props.returnUrl },
      redirect: 'if_required',
    });
    setSubmitting(false);
    if (result.error) return setError(result.error.message ?? t('failed'));
    setAwaitingConfirmation(true);
  };

  if (awaitingConfirmation) {
    return <div className="pt-6"><p className="text-sm">{t('pending')}</p><p className="mt-2 text-xs text-[var(--color-paper-faint)]">{t('pendingHint')}</p></div>;
  }

  return (
    <div className="pt-6">
      <PaymentElement />
      {error && <p role="alert" className="pt-3 text-sm text-[var(--color-clay)]">{error}</p>}
      <button type="button" onClick={submit} disabled={!stripe || submitting} className="mt-5 w-full rounded-full bg-[var(--color-brass)] px-5 py-3 text-[var(--color-ink-950)] disabled:opacity-50">
        {submitting ? t('processing') : `${t('confirm')} · ${props.amountLabel}`}
      </button>
      <button type="button" disabled={submitting} onClick={async () => { await props.cancelAction(props.attemptId); props.onCancelled(); }} className="mt-3 w-full rounded-full border border-[var(--color-ink-700)] px-5 py-2.5 text-sm disabled:opacity-50">
        {t('cancel')}
      </button>
    </div>
  );
}
