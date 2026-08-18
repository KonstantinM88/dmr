/** Client-safe типы заказов (Этап 2). Без Prisma. */

export const ORDER_ROUND_STATUSES = [
  'SUBMITTED',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'IN_PROGRESS',
  'READY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
] as const;

export type OrderRoundStatus = (typeof ORDER_ROUND_STATUSES)[number];

export const ORDER_ITEM_STATUSES = [
  'SUBMITTED',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
] as const;

export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

/** Позиция корзины, как её присылает устройство гостя. */
export type CartLineInput = {
  menuItemId: string;
  menuVariantId?: string | null;
  modifierOptionIds?: string[];
  quantity: number;
  note?: string | null;
  /** Цена, показанная гостю. Сервер сверяет её и сообщает о расхождении. */
  expectedUnitPriceCents?: number | null;
};

export type OrderItemView = {
  id: string;
  name: string;
  variantName: string | null;
  modifiers: string[];
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  status: OrderItemStatus;
  seatLabel: string | null;
  note: string | null;
};

export type OrderRoundView = {
  id: string;
  sequence: number;
  status: OrderRoundStatus;
  isFirstRound: boolean;
  approvalMode: 'REQUIRE_WAITER' | 'AUTO_ACCEPT';
  submittedAt: string;
  totalGrossCents: number;
  createdByStaff: boolean;
  items: OrderItemView[];
};

/** Причины отказа при отправке заказа — в UI переводятся, не показываются как код. */
export type SubmitOrderFailureReason =
  | 'no_table'
  | 'no_session'
  | 'session_closed'
  | 'payment_pending'
  | 'rate_limited'
  | 'empty_cart'
  | 'invalid_quantity'
  | 'item_unavailable'
  | 'price_changed';

export type SubmitOrderResult =
  | {
      ok: true;
      roundId: string;
      sequence: number;
      status: OrderRoundStatus;
      totalGrossCents: number;
      /** true, если запрос был повтором с тем же clientRequestId. */
      deduplicated: boolean;
    }
  | {
      ok: false;
      reason: SubmitOrderFailureReason;
      unavailableItemIds?: string[];
      changedPrices?: Array<{ menuItemId: string; actualUnitPriceCents: number }>;
    };
