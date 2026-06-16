export type MlbDoubleheaderLike = {
  external_event_id?: string | null;
  game_label?: string | null;
  game_start_time?: string | null;
};

function getEventIdentity(row: MlbDoubleheaderLike) {
  if (row.external_event_id) return row.external_event_id;
  if (row.game_start_time) return row.game_start_time;
  return null;
}

export function getMlbDoubleheaderGameLabels<T extends MlbDoubleheaderLike>(rows: T[]) {
  const labelsByEvent = new Map<string, Set<string>>();

  for (const row of rows) {
    const gameLabel = row.game_label?.trim();
    const eventIdentity = getEventIdentity(row);

    if (!gameLabel || !eventIdentity) continue;

    const existing = labelsByEvent.get(gameLabel) ?? new Set<string>();
    existing.add(eventIdentity);
    labelsByEvent.set(gameLabel, existing);
  }

  return new Set(
    Array.from(labelsByEvent.entries())
      .filter(([, eventIds]) => eventIds.size > 1)
      .map(([gameLabel]) => gameLabel)
  );
}

export function isMlbDoubleheaderGameLabel(
  gameLabel: string | null | undefined,
  doubleheaderGameLabels: Set<string>
) {
  if (!gameLabel) return false;
  return doubleheaderGameLabels.has(gameLabel.trim());
}
