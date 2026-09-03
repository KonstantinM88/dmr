'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/components/order/CartProvider';
import { formatCents } from '@/lib/money';
import type { MenuItemView } from '@/domains/menu/shared/types';

type Props = {
  item: MenuItemView;
  locale: string;
  currency: string;
};

/**
 * Выбор варианта, модификаторов и количества с добавлением в корзину.
 * Цена здесь предварительная: окончательную считает сервер при отправке.
 */
export function AddToCartControls({ item, locale, currency }: Props) {
  const t = useTranslations('menu');
  const tCart = useTranslations('cart');
  const { addLine } = useCart();

  const availableVariants = item.variants.filter((variant) => variant.isAvailable);
  const [variantId, setVariantId] = useState<string | null>(
    availableVariants.find((variant) => variant.isDefault)?.id ?? availableVariants[0]?.id ?? null,
  );
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  if (!item.isAvailable) return null;

  const variant = availableVariants.find((candidate) => candidate.id === variantId) ?? null;
  const basePrice = variant ? variant.priceCents : item.basePriceCents;

  const modifierDelta = item.modifierGroups
    .flatMap((group) => group.options)
    .filter((option) => optionIds.includes(option.id))
    .reduce((sum, option) => sum + option.priceDeltaCents, 0);

  const unitPriceCents = basePrice + modifierDelta;

  const toggleOption = (groupId: string, optionId: string, single: boolean) => {
    const group = item.modifierGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;

    setOptionIds((current) => {
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      const groupOptionIds = group.options.map((option) => option.id);
      const without = single ? current.filter((id) => !groupOptionIds.includes(id)) : current;
      return [...without, optionId];
    });
  };

  const handleAdd = () => {
    addLine({
      menuItemId: item.id,
      menuVariantId: variant?.id ?? null,
      modifierOptionIds: optionIds,
      quantity,
      note: null,
      name: item.name,
      variantName: variant?.name ?? null,
      unitPriceCents,
    });
    setAdded(true);
    setQuantity(1);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="mt-5 space-y-4 border-t border-[var(--color-ink-800)] pt-4">
      {availableVariants.length > 1 && (
        <fieldset>
          <legend className="eyebrow">{t('variants')}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {availableVariants.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === variantId}
                onClick={() => setVariantId(candidate.id)}
                className={
                  candidate.id === variantId
                    ? 'rounded-full border border-[var(--color-brass)] bg-[var(--color-brass)]/10 px-3.5 py-1.5 text-xs text-[var(--color-brass)]'
                    : 'rounded-full border border-[var(--color-ink-700)] px-3.5 py-1.5 text-xs text-[var(--color-paper-dim)] transition hover:border-[var(--color-brass-dim)]'
                }
              >
                {candidate.name} · {formatCents(candidate.priceCents, locale, currency)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {item.modifierGroups.map((group) => (
        <fieldset key={group.id}>
          <legend className="eyebrow">{group.title}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {group.options
              .filter((option) => option.isAvailable)
              .map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={optionIds.includes(option.id)}
                  onClick={() =>
                    toggleOption(group.id, option.id, group.selectionType === 'SINGLE')
                  }
                  className={
                    optionIds.includes(option.id)
                      ? 'rounded-full border border-[var(--color-brass)] bg-[var(--color-brass)]/10 px-3.5 py-1.5 text-xs text-[var(--color-brass)]'
                      : 'rounded-full border border-[var(--color-ink-700)] px-3.5 py-1.5 text-xs text-[var(--color-paper-dim)] transition hover:border-[var(--color-brass-dim)]'
                  }
                >
                  {option.name}
                  {option.priceDeltaCents !== 0
                    ? ` ${option.priceDeltaCents > 0 ? '+' : ''}${formatCents(option.priceDeltaCents, locale, currency)}`
                    : ''}
                </button>
              ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-ink-800)] bg-[var(--color-ink-950)]/45 p-1">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            aria-label={tCart('decrease')}
            className="h-9 w-9 rounded-full border border-[var(--color-ink-700)] text-lg transition hover:border-[var(--color-brass-dim)] hover:text-[var(--color-brass)]"
          >
            −
          </button>
          <span className="w-6 text-center font-[family-name:var(--font-mono)] text-sm">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.min(50, value + 1))}
            aria-label={tCart('increase')}
            className="h-9 w-9 rounded-full border border-[var(--color-ink-700)] text-lg transition hover:border-[var(--color-brass-dim)] hover:text-[var(--color-brass)]"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className={
            added
              ? 'min-h-12 flex-1 rounded-full border border-[var(--color-sage)] bg-[var(--color-sage)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink-950)] transition'
              : 'min-h-12 flex-1 rounded-full border border-[var(--color-brass)] bg-[var(--color-brass)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink-950)] shadow-[0_12px_28px_rgba(199,154,69,0.16)] transition hover:bg-[#d6aa54]'
          }
        >
          {added
            ? tCart('added')
            : `${tCart('add')} · ${formatCents(unitPriceCents * quantity, locale, currency)}`}
        </button>
      </div>
    </div>
  );
}
