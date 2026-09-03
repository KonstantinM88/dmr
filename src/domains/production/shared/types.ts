/** Client-safe contract производственных очередей (Этап 3). */

export const PRODUCTION_TICKET_STATUSES = [
  'QUEUED',
  'ACCEPTED',
  'IN_PROGRESS',
  'READY',
  'HANDED_OFF',
  'CANCELLED',
] as const;

export type ProductionTicketStatus = (typeof PRODUCTION_TICKET_STATUSES)[number];

export const PRODUCTION_STATION_KINDS = ['KITCHEN', 'BAR', 'OTHER'] as const;
export type ProductionStationKind = (typeof PRODUCTION_STATION_KINDS)[number];

export type ProductionQueueTicket = {
  id: string;
  status: ProductionTicketStatus;
  stationKind: ProductionStationKind;
  stationName: string;
  tableLabel: string;
  roundSequence: number;
  itemName: string;
  variantName: string | null;
  modifiers: string[];
  quantity: number;
  note: string | null;
  recommendedPreparationMinutes: number | null;
  criticalPreparationMinutes: number | null;
  queuedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  updatedAt: string;
};

export type ProductionQueueSnapshot = {
  stationKind: ProductionStationKind;
  cursor: string;
  readyHandoffSla: {
    warningMinutes: number | null;
    criticalMinutes: number | null;
  };
  tickets: ProductionQueueTicket[];
};

export type ProductionQueueDelta = ProductionQueueSnapshot & {
  full: boolean;
};

export type TransitionTicketResult =
  | { ok: true; status: ProductionTicketStatus }
  | {
      ok: false;
      reason: 'not_found' | 'wrong_station' | 'invalid_transition';
    };
