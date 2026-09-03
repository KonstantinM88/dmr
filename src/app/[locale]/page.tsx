import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPublishedMenu } from '@/domains/menu/server/menu.queries';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import { getActiveSessionForTable } from '@/domains/sessions/server/session.service';
import { canSubmitOrders } from '@/domains/sessions/server/session-state-machine';
import { getRoundsForSession } from '@/domains/orders/server/order.queries';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { CartProvider } from '@/components/order/CartProvider';
import { CartSheet } from '@/components/order/CartSheet';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { formatCents } from '@/lib/money';
import { getBillView } from '@/domains/billing/server/bill.service';
import { DEFAULT_VENUE_SLUG, TABLE_TOKEN_COOKIE } from '@/lib/venue';
import { PollingRefresh } from '@/components/realtime/PollingRefresh';
import { WaiterCallButton } from '@/components/service/WaiterCallButton';
import { getActiveWaiterCall } from '@/domains/service-requests/server/waiter-call.service';
import { callWaiterAction, cancelWaiterCallAction, submitOrderAction } from './actions';
import { isSupportedLocale } from '@/i18n/routing';

/**
 * Публичное меню и заказ (Server Component).
 * Динамический рендер: страница читает cookie стола и состояние сессии.
 */
export const dynamic = 'force-dynamic';

export default async function MenuPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { locale } = await props.params;
  const { table: tableFlag } = await props.searchParams;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('menu');
  const tCommon = await getTranslations('common');
  const tTable = await getTranslations('table');
  const tPayment = await getTranslations('payment');

  const cookieStore = await cookies();
  const tableToken = cookieStore.get(TABLE_TOKEN_COOKIE)?.value;
  const table = tableToken ? await resolveTableByToken(tableToken) : null;

  const session = table ? await getActiveSessionForTable(table.tableId) : null;
  const rounds = session ? await getRoundsForSession(session.id) : [];

  const menu = await getPublishedMenu(DEFAULT_VENUE_SLUG, locale);
  const bill = session ? await getBillView(session.id) : null;
  const waiterCall = session ? await getActiveWaiterCall(session.id) : null;

  // Заказ возможен только за распознанным столом. Пока сессии нет, она будет
  // открыта автоматически при первой отправке заказа.
  const sessionAllowsOrders = session ? canSubmitOrders(session.status) : true;
  const canOrder = table !== null && sessionAllowsOrders;
  const showDevelopmentQrEntry = process.env.NODE_ENV === 'development';

  const blockedReason =
    session && !sessionAllowsOrders
      ? session.status === 'PAYMENT_PENDING'
        ? ('payment_pending' as const)
        : ('session_closed' as const)
      : null;

  // Ключ корзины: новая сессия стола начинается с пустой корзины.
  const cartKey = session ? session.id : (table?.tableId ?? 'no-table');

  return (
    <CartProvider sessionKey={cartKey}>
      <PollingRefresh endpoint="/api/live/guest" visibleIntervalMs={8_000} />
      <main className="mx-auto w-full max-w-2xl px-5 pb-32 pt-10">
        <header className="border-b border-[var(--color-ink-800)] pb-6">
          <p className="eyebrow">{menu?.venueName ?? tCommon('appName')}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-paper-dim)]">{t('subtitle')}</p>

          {table && (
            <p className="mt-5 inline-flex items-center rounded-full border border-[var(--color-brass-dim)] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
              {tTable('label', { label: table.label })}
            </p>
          )}

          {!table && (
            <p className="mt-5 text-sm text-[var(--color-paper-dim)]">{tTable('scanRequired')}</p>
          )}

          {tableFlag === 'invalid' && (
            <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/10 p-4">
              <p className="text-sm text-[var(--color-clay)]">{tTable('invalidToken')}</p>
              <p className="mt-1 text-xs text-[var(--color-paper-dim)]">
                {tTable('invalidTokenBody')}
              </p>
            </div>
          )}

          {table && (
            <WaiterCallButton
              key={waiterCall ? `${waiterCall.id}:${waiterCall.status}` : 'no-waiter-call'}
              initialCall={waiterCall}
              callAction={callWaiterAction}
              cancelAction={cancelWaiterCallAction}
            />
          )}

          {showDevelopmentQrEntry && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-3">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.16em] text-[var(--color-brass)]">
                  {tCommon('developmentOnly')}
                </p>
                <p className="mt-1 text-xs text-[var(--color-paper-dim)]">
                  {tCommon('developmentQrDescription')}
                </p>
              </div>
              <Link
                href="/api/dev/qr-entry"
                prefetch={false}
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--color-brass)] px-4 py-2 font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-brass)] transition-colors hover:bg-[var(--color-brass)] hover:text-[var(--color-ink-950)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brass)]"
              >
                {tCommon('developmentQrButton')}
              </Link>
            </div>
          )}
        </header>

        {session && (
          <OrderStatusPanel
            rounds={rounds}
            locale={locale}
            currency={menu?.currency ?? 'EUR'}
            approvalMode={session.reorderApprovalMode}
          />
        )}

        {bill && bill.remainingCents > 0 && (
          <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
            <div className="price-rail">
              <span className="text-sm">{tPayment('remaining')}</span>
              <span className="price-rail__leader" aria-hidden="true" />
              <span className="price-rail__value">
                {formatCents(bill.remainingCents, locale, bill.currency)}
              </span>
            </div>

            {bill.requestedAt && (
              <p className="pt-2 text-xs text-[var(--color-sage)]">
                {tPayment('requestedByStaff')}
              </p>
            )}

            <Link
              href={`/${locale}/bezahlen`}
              className="mt-3 inline-block rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-sm text-[var(--color-brass)]"
            >
              {tPayment('openBill')}
            </Link>
          </section>
        )}

        {!menu || menu.categories.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--color-paper-dim)]">{t('empty')}</p>
        ) : (
          menu.categories.map((category) => (
            <section key={category.id} className="pt-10" aria-labelledby={`cat-${category.id}`}>
              <h2
                id={`cat-${category.id}`}
                className="eyebrow border-b border-[var(--color-brass-dim)] pb-2"
              >
                {category.title}
              </h2>

              {category.description && (
                <p className="pt-3 text-sm text-[var(--color-paper-dim)]">{category.description}</p>
              )}

              {category.items.length === 0 ? (
                <p className="py-6 text-sm text-[var(--color-paper-faint)]">{t('categoryEmpty')}</p>
              ) : (
                <div className="pt-2">
                  {category.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      locale={locale}
                      currency={menu.currency}
                      canOrder={canOrder}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}

        <footer className="mt-14 border-t border-[var(--color-ink-800)] pt-6">
          <p className="text-xs leading-relaxed text-[var(--color-paper-faint)]">
            {t('allergenDisclaimer')}
          </p>
        </footer>
      </main>

      {table && (
        <CartSheet
          locale={locale}
          currency={menu?.currency ?? 'EUR'}
          canOrder={canOrder}
          blockedReason={blockedReason}
          submitAction={submitOrderAction}
        />
      )}
    </CartProvider>
  );
}
