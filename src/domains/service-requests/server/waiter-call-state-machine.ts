export type ActiveWaiterCallStatus = 'OPEN' | 'ACKNOWLEDGED';
export type WaiterCallStatus = ActiveWaiterCallStatus | 'RESOLVED' | 'CANCELLED';

const TRANSITIONS: Record<ActiveWaiterCallStatus, readonly WaiterCallStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'],
  ACKNOWLEDGED: ['RESOLVED', 'CANCELLED'],
};

export function canTransitionWaiterCall(from: WaiterCallStatus, to: WaiterCallStatus): boolean {
  if (from === 'RESOLVED' || from === 'CANCELLED') return false;
  return TRANSITIONS[from].includes(to);
}

export function assertWaiterCallTransition(
  from: WaiterCallStatus,
  to: WaiterCallStatus,
): void {
  if (!canTransitionWaiterCall(from, to)) {
    throw new Error(`Недопустимый переход вызова официанта: ${from} → ${to}`);
  }
}
