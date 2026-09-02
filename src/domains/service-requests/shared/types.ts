export type WaiterCallView = {
  id: string;
  sessionId: string;
  tableLabel: string;
  status: 'OPEN' | 'ACKNOWLEDGED';
  requestedAt: string;
  acknowledgedAt: string | null;
};

export type CallWaiterResult =
  | { ok: true; call: WaiterCallView; reused: boolean }
  | { ok: false; reason: 'no_table' | 'rate_limited' | 'session_closed' };
