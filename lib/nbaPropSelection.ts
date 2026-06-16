type NbaPropLike = {
  id: number;
  game_label?: string | null;
  player_name?: string | null;
};

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function getNbaPropConflictKey(row: Pick<NbaPropLike, "game_label" | "player_name">) {
  return `${normalizeLookupValue(row.game_label)}|${normalizeLookupValue(row.player_name)}`;
}

export function selectUniqueNbaPropRows<T extends NbaPropLike>(
  rows: T[],
  limit: number,
  blockedConflictKeys?: Set<string>
) {
  const selected: T[] = [];
  const usedConflictKeys = new Set(blockedConflictKeys ?? []);

  for (const row of rows) {
    const conflictKey = getNbaPropConflictKey(row);
    if (usedConflictKeys.has(conflictKey)) {
      continue;
    }

    selected.push(row);
    usedConflictKeys.add(conflictKey);

    if (selected.length >= limit) {
      break;
    }
  }

  return {
    rows: selected,
    conflictKeys: usedConflictKeys,
  };
}

export function buildUniqueNbaPropPool<T extends NbaPropLike>(
  rows: T[],
  blockedConflictKeys?: Set<string>
) {
  return selectUniqueNbaPropRows(rows, Number.MAX_SAFE_INTEGER, blockedConflictKeys).rows;
}
