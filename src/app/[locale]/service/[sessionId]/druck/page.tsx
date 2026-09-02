import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { PrintablePaymentDocument } from '@/components/payment/PrintablePaymentDocument';
import { getPrintableBillDocument } from '@/domains/payments/server/printable-document.service';
import {
  AuthenticationRequiredError,
  requirePermission,
} from '@/domains/staff/server/rbac';

export const dynamic = 'force-dynamic';

export default async function FullPaymentPrintPage(props: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await props.params;
  setRequestLocale(locale);
  const principal = await requirePermission('VIEW_ASSIGNED_TABLES').catch((error: unknown) => {
    if (error instanceof AuthenticationRequiredError) redirect(`/${locale}/anmelden`);
    throw error;
  });
  const document = await getPrintableBillDocument(sessionId, principal.venueId);
  if (!document) notFound();

  return <PrintablePaymentDocument document={document} locale={locale} />;
}
