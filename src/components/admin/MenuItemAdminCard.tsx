'use client';

import { useTranslations } from 'next-intl';
import type { AdminMenuItemView } from '@/domains/menu/shared/types';
import { formatCents } from '@/lib/money';
import { AvailabilityToggle } from '@/components/menu/AvailabilityToggle';
import { ProductionSlaEditor } from '@/components/admin/ProductionSlaEditor';

type Props = {
  item: AdminMenuItemView;
  locale: string;
  availabilityAction: (payload: unknown) => Promise<{ ok: boolean }>;
  slaAction: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
};

export function MenuItemAdminCard({ item, locale, availabilityAction, slaAction }: Props) {
  const t = useTranslations('admin');
  const image = item.media.find((asset) => asset.kind === 'IMAGE');
  const video = item.media.find((asset) => asset.kind === 'VIDEO');
  const station =
    item.stationKind === 'KITCHEN'
      ? t('stationKitchen')
      : item.stationKind === 'BAR'
        ? t('stationBar')
        : item.stationKind === 'OTHER'
          ? t('stationOther')
          : (item.stationName ?? t('stationUnassigned'));

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-ink-800)] bg-[var(--color-ink-900)]/70">
      <div className="aspect-[16/9] bg-[var(--color-ink-850)]">
        {video ? (
          <video
            src={video.url}
            poster={video.posterUrl ?? image?.url ?? undefined}
            controls
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.altText ?? item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-[var(--color-paper-faint)]">
            {t('mediaMissing')}
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{item.slug}</p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight">
              {item.name}
            </h3>
          </div>
          <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
            {formatCents(item.basePriceCents, locale)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[var(--color-ink-850)] px-2 py-1 text-[var(--color-paper-dim)]">
            {station}
          </span>
          <span className="rounded-full bg-[var(--color-ink-850)] px-2 py-1 text-[var(--color-paper-faint)]">
            {item.isPublished ? t('published') : t('unpublished')}
          </span>
          {item.taxRateBasisPoints !== null && (
            <span className="rounded-full bg-[var(--color-ink-850)] px-2 py-1 text-[var(--color-paper-faint)]">
              {t('taxShort', { rate: item.taxRateBasisPoints / 100 })}
            </span>
          )}
        </div>

        {item.shortDescription && (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-paper-dim)]">
            {item.shortDescription}
          </p>
        )}
        {item.fullDescription && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-paper-faint)]">
            {item.fullDescription}
          </p>
        )}
        {item.ingredients && (
          <p className="mt-3 text-xs text-[var(--color-paper-faint)]">
            <span className="text-[var(--color-paper-dim)]">{t('ingredients')}:</span>{' '}
            {item.ingredients}
          </p>
        )}

        <div className="mt-4">
          <AvailabilityToggle
            itemId={item.id}
            isAvailable={item.isAvailable}
            action={availabilityAction}
          />
        </div>

        <ProductionSlaEditor
          itemId={item.id}
          warningMinutes={item.recommendedPreparationMinutes}
          criticalMinutes={item.criticalPreparationMinutes}
          action={slaAction}
        />
      </div>
    </article>
  );
}
