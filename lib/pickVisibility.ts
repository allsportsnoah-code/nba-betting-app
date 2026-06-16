type HistoricalDisplayPick = {
  sport?: string | null;
  market_scope?: string | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

export function isOfficialHistoricalPick(row: HistoricalDisplayPick) {
  if (row.sport !== "MLB") return true;
  if (row.market_scope !== "team" && row.market_scope !== "player_prop") return true;

  return Boolean(row.is_top_pick) || row.notes === "best_value";
}

export function filterOfficialHistoricalPicks<T extends HistoricalDisplayPick>(rows: T[]) {
  return rows.filter(isOfficialHistoricalPick);
}
