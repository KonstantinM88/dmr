/** Возвращает только ещё не показанные этому рабочему экрану сигналы. */
export function unseenOperationalSignalIds(
  signalIds: readonly string[],
  seenIds: ReadonlySet<string>,
): string[] {
  return [...new Set(signalIds)].filter((id) => !seenIds.has(id));
}
