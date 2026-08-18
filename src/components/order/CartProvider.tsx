'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * Персональная корзина устройства (docs/product-spec.md §2.5).
 *
 * Хранится локально и переживает перезагрузку. Ключ включает идентификатор
 * сессии стола: новая сессия начинается с пустой корзины, а чужая корзина не
 * «переезжает» на другой стол.
 *
 * Реализована как внешнее хранилище поверх `useSyncExternalStore`, а не через
 * чтение localStorage в эффекте: серверный снимок всегда пустой, поэтому
 * разметка при гидрации совпадает, а восстановление корзины происходит после
 * подписки, без каскадных перерисовок.
 *
 * Цены здесь — только для предварительного показа. Итоговую сумму считает
 * сервер по данным БД; расхождение возвращается как «цена изменилась».
 */
export type CartLine = {
  lineId: string;
  menuItemId: string;
  menuVariantId: string | null;
  modifierOptionIds: string[];
  quantity: number;
  note: string | null;
  name: string;
  variantName: string | null;
  unitPriceCents: number;
};

type CartSnapshot = {
  lines: CartLine[];
  restored: boolean;
};

type CartState = CartSnapshot & {
  addLine: (line: Omit<CartLine, 'lineId'>) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  totalCents: number;
  itemCount: number;
};

const EMPTY_SNAPSHOT: CartSnapshot = { lines: [], restored: false };

const CartContext = createContext<CartState | null>(null);

type CartStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => CartSnapshot;
  getServerSnapshot: () => CartSnapshot;
  update: (next: CartLine[], restored?: boolean) => void;
};

function createCartStore(sessionKey: string): CartStore {
  const storageKey = `dmr.cart.${sessionKey}`;
  const listeners = new Set<() => void>();

  let snapshot: CartSnapshot = EMPTY_SNAPSHOT;
  let loaded = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const persist = (lines: CartLine[]) => {
    try {
      if (lines.length === 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // Приватный режим браузера может запрещать запись: корзина продолжает
      // работать в памяти до перезагрузки страницы.
    }
  };

  const load = () => {
    loaded = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        snapshot = { lines: parsed as CartLine[], restored: true };
        emit();
      }
    } catch {
      // Повреждённая корзина не должна ломать страницу меню.
      window.localStorage.removeItem(storageKey);
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!loaded) load();
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    getServerSnapshot() {
      return EMPTY_SNAPSHOT;
    },
    update(next, restored = false) {
      snapshot = { lines: next, restored };
      persist(next);
      emit();
    },
  };
}

function signature(line: Pick<CartLine, 'menuItemId' | 'menuVariantId' | 'modifierOptionIds' | 'note'>) {
  return [
    line.menuItemId,
    line.menuVariantId ?? '',
    [...line.modifierOptionIds].sort().join(','),
    line.note ?? '',
  ].join('|');
}

export function CartProvider({
  sessionKey,
  children,
}: {
  sessionKey: string;
  children: ReactNode;
}) {
  const store = useMemo(() => createCartStore(sessionKey), [sessionKey]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const addLine = useCallback(
    (line: Omit<CartLine, 'lineId'>) => {
      const current = store.getSnapshot().lines;
      const index = current.findIndex((entry) => signature(entry) === signature(line));

      if (index >= 0) {
        const existing = current[index];
        if (!existing) return;
        const next = [...current];
        next[index] = { ...existing, quantity: existing.quantity + line.quantity };
        store.update(next);
        return;
      }

      store.update([...current, { ...line, lineId: crypto.randomUUID() }]);
    },
    [store],
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      const current = store.getSnapshot().lines;
      store.update(
        quantity < 1
          ? current.filter((line) => line.lineId !== lineId)
          : current.map((line) => (line.lineId === lineId ? { ...line, quantity } : line)),
      );
    },
    [store],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      store.update(store.getSnapshot().lines.filter((line) => line.lineId !== lineId));
    },
    [store],
  );

  const clear = useCallback(() => {
    store.update([]);
  }, [store]);

  const value = useMemo<CartState>(() => {
    const totalCents = snapshot.lines.reduce(
      (sum, line) => sum + line.unitPriceCents * line.quantity,
      0,
    );
    const itemCount = snapshot.lines.reduce((sum, line) => sum + line.quantity, 0);

    return {
      lines: snapshot.lines,
      restored: snapshot.restored,
      addLine,
      setQuantity,
      removeLine,
      clear,
      totalCents,
      itemCount,
    };
  }, [snapshot, addLine, setQuantity, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart используется вне CartProvider.');
  return context;
}
