'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MenuItemView } from '@/domains/menu/shared/types';
import { AddToCartControls } from '@/components/menu/AddToCartControls';
import { MenuMediaViewer } from '@/components/menu/MenuMediaViewer';
import { displayPriceCents, hasMultiplePrices } from '@/domains/menu/shared/types';
import { formatCents } from '@/lib/money';

type Props = {
  item: MenuItemView;
  locale: string;
  currency: string;
  /** false, пока сессия стола не принимает заказы (оплата/закрытие). */
  canOrder: boolean;
};

/** Гостевая editorial-карточка: крупное media, описание и заказ. */
export function MenuItemCard({ item, locale, currency, canOrder }: Props) {
  const t = useTranslations('menu');
  const [expanded, setExpanded] = useState(false);
  const price = formatCents(displayPriceCents(item), locale, currency);

  return (
    <article
      className="overflow-hidden rounded-[1.25rem] border border-[var(--color-ink-800)] bg-[linear-gradient(145deg,rgba(28,35,32,0.96),rgba(15,19,17,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.18)] transition duration-500 hover:border-[var(--color-ink-700)] hover:shadow-[0_30px_85px_rgba(0,0,0,0.28)]"
      aria-labelledby={`item-${item.id}-name`}
    >
      {item.media.length > 0 && <MenuMediaViewer itemName={item.name} media={item.media} />}

      <div className="p-5 sm:p-6">
        <div className="price-rail items-start">
          <h3
            id={`item-${item.id}-name`}
            className="max-w-[75%] font-[family-name:var(--font-display)] text-xl leading-[1.08] tracking-[-0.02em] sm:text-[1.4rem]"
          >
            {item.name}
          </h3>
          <span className="price-rail__leader mt-3" aria-hidden="true" />
          <span className="price-rail__value pt-0.5 text-sm">
            {hasMultiplePrices(item) ? `${t('from')} ${price}` : price}
          </span>
        </div>

        {item.shortDescription && (
          <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--color-paper-dim)]">
            {item.shortDescription}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!item.isAvailable && (
            <span className="rounded-full border border-[var(--color-clay)]/35 bg-[var(--color-clay)]/10 px-2.5 py-1 text-xs text-[var(--color-clay)]">
              {t('soldOut')}
            </span>
          )}
          {item.dietaryTags.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-sage)]/10 px-2.5 py-1 text-xs text-[var(--color-sage)]">
              {tag}
            </span>
          ))}
          {item.spiceLevel !== 'NONE' && (
            <span className="rounded-full bg-[var(--color-brass)]/8 px-2.5 py-1 text-xs text-[var(--color-brass)]">
              {t(`spiceLevel.${item.spiceLevel}`)}
            </span>
          )}
        </div>

        {(item.fullDescription ?? item.ingredients ?? item.allergens.length > 0) && (
          <div className="mt-4 border-t border-[var(--color-ink-800)] pt-4">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={`item-${item.id}-details`}
              className="flex w-full items-center justify-between gap-3 text-left font-[family-name:var(--font-mono)] text-[0.68rem] uppercase tracking-[0.13em] text-[var(--color-brass)]"
            >
              <span>{t('ingredients')}</span>
              <span aria-hidden="true" className="text-base font-light">{expanded ? '−' : '+'}</span>
            </button>

            {expanded && (
              <div id={`item-${item.id}-details`} className="mt-4 space-y-3 text-sm leading-relaxed">
                {item.fullDescription && <p className="text-[var(--color-paper-dim)]">{item.fullDescription}</p>}
                {item.ingredients && <p className="text-[var(--color-paper-faint)]">{item.ingredients}</p>}
                {item.variants.length > 0 && (
                  <ul className="space-y-1.5">
                    {item.variants.map((variant) => (
                      <li key={variant.id} className="price-rail">
                        <span className="text-[var(--color-paper-dim)]">
                          {variant.name}
                          {variant.amountValue !== null && variant.amountUnit
                            ? ` · ${variant.amountValue} ${variant.amountUnit}`
                            : ''}
                        </span>
                        <span className="price-rail__leader" aria-hidden="true" />
                        <span className="price-rail__value">{formatCents(variant.priceCents, locale, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.allergens.length > 0 && (
                  <p className="text-[var(--color-paper-faint)]">
                    <span className="eyebrow">{t('allergens')}</span>{' '}
                    {item.allergens.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {canOrder && <AddToCartControls item={item} locale={locale} currency={currency} />}
      </div>
    </article>
  );
}
