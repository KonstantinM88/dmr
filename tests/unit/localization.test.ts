import { describe, expect, it } from 'vitest';
import { mergeWithFallback, type MessageTree } from '@/domains/localization/shared/messages';
import { loadMessages } from '@/domains/localization/shared/messages';
import de from '@/domains/localization/messages/de.json';
import ru from '@/domains/localization/messages/ru.json';
import { isSupportedLocale, locales } from '@/i18n/routing';

const flatten = (tree: MessageTree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : flatten(value, `${prefix}${key}.`),
  );

function expectCompleteCatalog(tree: MessageTree): void {
  for (const value of Object.values(tree)) {
    if (typeof value === 'string') {
      expect(value.trim()).not.toBe('');
      expect(value.toLowerCase()).not.toContain('missing translation');
      expect(value).not.toMatch(/^TODO/i);
    } else {
      expectCompleteCatalog(value);
    }
  }
}

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
  it('не содержит пустых значений и заглушек', () => {
    expectCompleteCatalog(de as MessageTree);
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

describe('каталог ru', () => {
  it('публично включает русский язык', () => {
    expect(locales).toEqual(['de', 'ru']);
    expect(isSupportedLocale('ru')).toBe(true);
  });

  it('не содержит пустых значений и имеет те же ключи, что de', () => {
    expectCompleteCatalog(ru as MessageTree);
    expect(flatten(ru as MessageTree).sort()).toEqual(flatten(de as MessageTree).sort());
  });

  it('загружает русский каталог без немецкого fallback для переведённых ключей', async () => {
    const messages = await loadMessages('ru') as { menu: { title: string } };
    expect(messages.menu.title).toBe('Меню');
  });
});
