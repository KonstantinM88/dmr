import { describe, expect, it } from 'vitest';
import { mergeWithFallback, type MessageTree } from '@/domains/localization/shared/messages';
import { loadMessages } from '@/domains/localization/shared/messages';
import de from '@/domains/localization/messages/de.json';

describe('fallback переводов', () => {
  it('неполный перевод откатывается на немецкий текст, а не на ключ', () => {
    const fallback: MessageTree = {
      menu: { title: 'Speisekarte', soldOut: 'Ausverkauft' },
    };
    const partial: MessageTree = { menu: { title: 'Menu' } };

    const merged = mergeWithFallback(fallback, partial) as { menu: Record<string, string> };

    expect(merged.menu.title).toBe('Menu');
    expect(merged.menu.soldOut).toBe('Ausverkauft');
  });

  it('пустая строка перевода не затирает немецкий текст', () => {
    const merged = mergeWithFallback(
      { menu: { soldOut: 'Ausverkauft' } },
      { menu: { soldOut: '   ' } },
    ) as { menu: Record<string, string> };

    expect(merged.menu.soldOut).toBe('Ausverkauft');
  });

  it('неизвестная локаль загружает немецкий каталог', async () => {
    const messages = await loadMessages('xx');
    expect(messages).toEqual(de);
  });
});

describe('каталог de', () => {
  const flatten = (tree: MessageTree, prefix = ''): string[] =>
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [`${prefix}${key}`]
        : flatten(value, `${prefix}${key}.`),
    );

  it('не содержит пустых значений и заглушек', () => {
    const walk = (tree: MessageTree): void => {
      for (const value of Object.values(tree)) {
        if (typeof value === 'string') {
          expect(value.trim()).not.toBe('');
          expect(value.toLowerCase()).not.toContain('missing translation');
          expect(value).not.toMatch(/^TODO/i);
        } else {
          walk(value);
        }
      }
    };
    walk(de as MessageTree);
  });

  it('содержит все обязательные UI-состояния из product-spec §5', () => {
    const keys = new Set(flatten(de as MessageTree));
    const required = [
      'common.loading',
      'common.offline',
      'menu.empty',
      'menu.soldOut',
      'cart.restored',
      'cart.priceChanged',
      'orderStatus.submissionPending',
      'orderStatus.awaitingWaiter',
      'orderStatus.accepted',
      'orderStatus.partiallyAccepted',
      'orderStatus.rejected',
      'orderStatus.preparing',
      'orderStatus.ready',
      'orderStatus.served',
      'orderStatus.reorderNeedsWaiter',
      'orderStatus.reorderAutoAccept',
      'payment.pending',
      'payment.failed',
      'payment.succeeded',
      'payment.partiallyPaid',
      'payment.paid',
      'payment.sessionClosed',
    ];

    for (const key of required) expect(keys).toContain(key);
  });
});
