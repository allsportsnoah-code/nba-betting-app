import { getCachedData, setCachedData } from "@/lib/cache";
import {
  getNbaPropConflictKey,
  selectUniqueNbaPropRows,
} from "@/lib/nbaPropSelection";
import { hasNbaTeamFreePickRiskCap } from "@/lib/nbaFreePickRisk";
import { getPickConfidenceStars } from "@/lib/starRatings";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getNbaTeamBestValueScore, getNbaTeamTopPickScore } from "@/lib/teamModel";

type NbaSnapshotPickRow = {
  id: number;
  sport?: string | null;
  market_scope?: string | null;
  market_type?: string | null;
  game_label?: string | null;
  player_name?: string | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  locked_at?: string | null;
  created_at?: string | null;
  game_start_time?: string | null;
  pick_date?: string | null;
};

export type NbaHistorySnapshot = {
  pickDate: string;
  updatedAt: string;
  starByPickId?: Record<string, number>;
  teamTopPickIds: number[];
  teamBestValueIds: number[];
  propTopPickIds: number[];
  propBestValueIds: number[];
};

export type NbaHistorySnapshotOverride = Partial<
  Pick<NbaHistorySnapshot, "starByPickId" | "teamTopPickIds" | "teamBestValueIds" | "propTopPickIds" | "propBestValueIds">
>;

const NBA_OFFICIAL_BOARD_SIZE = 3;

function getSnapshotCacheKey(pickDate: string) {
  return `nba_history_snapshot_${pickDate}`;
}

function getSnapshotOverrideCacheKey(pickDate: string) {
  return `nba_history_snapshot_override_${pickDate}`;
}

function capSnapshotBoardIds(ids: number[] | null | undefined) {
  return (ids ?? []).slice(0, NBA_OFFICIAL_BOARD_SIZE);
}

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getSavedTeamTopScore(
  row: Pick<NbaSnapshotPickRow, "market_type" | "edge" | "confidence_score" | "odds_taken">
) {
  return getNbaTeamTopPickScore({
    marketType: (row.market_type as "moneyline" | "spread" | "total" | null) ?? "spread",
    edge: row.edge ?? null,
    confidenceScore: row.confidence_score ?? null,
    oddsTaken: row.odds_taken ?? null,
  });
}

function getSavedTeamValueScore(
  row: Pick<NbaSnapshotPickRow, "market_type" | "edge" | "confidence_score" | "odds_taken">
) {
  return getNbaTeamBestValueScore({
    marketType: (row.market_type as "moneyline" | "spread" | "total" | null) ?? "spread",
    edge: row.edge ?? null,
    confidenceScore: row.confidence_score ?? null,
    oddsTaken: row.odds_taken ?? null,
  });
}

function getSavedPropValueScore(
  row: Pick<NbaSnapshotPickRow, "confidence_score" | "odds_taken">
) {
  return Number(((row.confidence_score ?? 0)).toFixed(1));
}

function getSavedPropTopScore(
  row: Pick<NbaSnapshotPickRow, "confidence_score" | "odds_taken">
) {
  return Number(((row.confidence_score ?? 0)).toFixed(1));
}

function sortTopPropRows(rows: NbaSnapshotPickRow[]) {
  return [...rows].sort((a, b) => {
    const scoreDelta = getSavedPropTopScore(b) - getSavedPropTopScore(a);
    if (scoreDelta !== 0) return scoreDelta;

    const confidenceDelta = (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    return normalizeLookupValue(a.created_at).localeCompare(normalizeLookupValue(b.created_at));
  });
}

function sortValuePropRows(rows: NbaSnapshotPickRow[]) {
  return [...rows].sort((a, b) => {
    const scoreDelta = getSavedPropValueScore(b) - getSavedPropValueScore(a);
    if (scoreDelta !== 0) return scoreDelta;

    const confidenceDelta = (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    return normalizeLookupValue(a.created_at).localeCompare(normalizeLookupValue(b.created_at));
  });
}

function getNbaSnapshotStars(row: NbaSnapshotPickRow) {
  const baseStars = getPickConfidenceStars({
    sport: "NBA",
    market_type: row.market_type,
    edge: row.edge,
    confidence_score: row.confidence_score,
    game_start_time: row.game_start_time,
  });

  if (baseStars >= 5 && row.market_scope === "team" && hasNbaTeamFreePickRiskCap(row)) {
    return 4;
  }

  return baseStars;
}

function applyNbaHistorySnapshotOverride(
  snapshot: NbaHistorySnapshot,
  override: NbaHistorySnapshotOverride | null | undefined
) {
  if (!override) return snapshot;

  return {
    ...snapshot,
    starByPickId: override.starByPickId
      ? {
          ...snapshot.starByPickId,
          ...override.starByPickId,
        }
      : snapshot.starByPickId,
    teamTopPickIds: override.teamTopPickIds ?? snapshot.teamTopPickIds,
    teamBestValueIds: override.teamBestValueIds ?? snapshot.teamBestValueIds,
    propTopPickIds: override.propTopPickIds ?? snapshot.propTopPickIds,
    propBestValueIds: override.propBestValueIds ?? snapshot.propBestValueIds,
  };
}

function buildNbaHistorySnapshot(rows: NbaSnapshotPickRow[], pickDate: string): NbaHistorySnapshot {
  const teamRows = rows.filter(
    (row) => row.sport === "NBA" && row.market_scope === "team"
  );
  const propRows = rows.filter(
    (row) => row.sport === "NBA" && row.market_scope === "player_prop"
  );

  const teamTopPickIds = teamRows
    .filter((row) => row.is_top_pick)
    .sort(
      (a, b) =>
        (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99) ||
        getSavedTeamTopScore(b) - getSavedTeamTopScore(a)
    )
    .slice(0, NBA_OFFICIAL_BOARD_SIZE)
    .map((row) => row.id);
  const selectedTeamTopIds = new Set(teamTopPickIds);
  const teamBestValueIds = teamRows
    .filter((row) => row.notes === "best_value" && !selectedTeamTopIds.has(row.id))
    .sort(
      (a, b) =>
        getSavedTeamValueScore(b) - getSavedTeamValueScore(a) ||
        getSavedTeamTopScore(b) - getSavedTeamTopScore(a)
    )
    .slice(0, NBA_OFFICIAL_BOARD_SIZE)
    .map((row) => row.id);

  const lockedPropTopRows = propRows
    .filter((row) => row.is_top_pick && row.locked_at)
    .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
  const unlockedPropTopRows = sortTopPropRows(
    propRows.filter((row) => row.is_top_pick && !row.locked_at)
  );
  const { rows: propTopPickRows } = selectUniqueNbaPropRows(
    [
      ...lockedPropTopRows,
      ...unlockedPropTopRows.filter((row) => !lockedPropTopRows.some((locked) => locked.id === row.id)),
    ],
    NBA_OFFICIAL_BOARD_SIZE
  );
  const propTopPickIds = propTopPickRows.map((row) => row.id);
  const selectedPropTopIds = new Set(propTopPickIds);

  const lockedPropBestValueRows = propRows
    .filter((row) => row.notes === "best_value" && row.locked_at && !selectedPropTopIds.has(row.id))
    .sort((a, b) => normalizeLookupValue(b.created_at).localeCompare(normalizeLookupValue(a.created_at)));
  const unlockedPropBestValueRows = sortValuePropRows(
    propRows.filter(
      (row) => row.notes === "best_value" && !row.locked_at && !selectedPropTopIds.has(row.id)
    )
  );
  const { rows: propBestValueRows } = selectUniqueNbaPropRows(
    [
      ...lockedPropBestValueRows,
      ...unlockedPropBestValueRows.filter(
        (row) => !lockedPropBestValueRows.some((locked) => locked.id === row.id)
      ),
    ],
    NBA_OFFICIAL_BOARD_SIZE,
    new Set(propTopPickRows.map((row) => getNbaPropConflictKey(row)))
  );
  const propBestValueIds = propBestValueRows.map((row) => row.id);
  const officialIds = new Set([
    ...teamTopPickIds,
    ...teamBestValueIds,
    ...propTopPickIds,
    ...propBestValueIds,
  ]);
  const officialRows = rows.filter((row) => officialIds.has(row.id));

  return {
    pickDate,
    updatedAt: new Date().toISOString(),
    starByPickId: Object.fromEntries(officialRows.map((row) => [String(row.id), getNbaSnapshotStars(row)])),
    teamTopPickIds,
    teamBestValueIds,
    propTopPickIds,
    propBestValueIds,
  };
}

export async function getNbaHistorySnapshot(pickDate: string) {
  const cached = await getCachedData(getSnapshotCacheKey(pickDate));
  const snapshot = (cached?.data as NbaHistorySnapshot | null) ?? null;
  if (!snapshot) return null;

  const overrideRow = await getCachedData(getSnapshotOverrideCacheKey(pickDate));
  const override = (overrideRow?.data as NbaHistorySnapshotOverride | null) ?? null;
  return applyNbaHistorySnapshotOverride(snapshot, override);
}

export async function setNbaHistorySnapshot(snapshot: NbaHistorySnapshot) {
  await setCachedData(getSnapshotCacheKey(snapshot.pickDate), snapshot);
}

export async function setNbaHistorySnapshotOverride(
  pickDate: string,
  override: NbaHistorySnapshotOverride
) {
  await setCachedData(getSnapshotOverrideCacheKey(pickDate), override);
}

export function getNbaSnapshotTeamTopPickIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.teamTopPickIds);
}

export function getNbaSnapshotTeamBestValueIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.teamBestValueIds);
}

export function getNbaSnapshotPropTopPickIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.propTopPickIds);
}

export function getNbaSnapshotPropBestValueIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.propBestValueIds);
}

export function getNbaSnapshotTopPickIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return [
    ...getNbaSnapshotTeamTopPickIds(snapshot),
    ...getNbaSnapshotPropTopPickIds(snapshot),
  ];
}

export function getNbaSnapshotBestValueIds(snapshot: NbaHistorySnapshot | null | undefined) {
  return [
    ...getNbaSnapshotTeamBestValueIds(snapshot),
    ...getNbaSnapshotPropBestValueIds(snapshot),
  ];
}

export function getNbaHistorySnapshotStar(
  snapshot: NbaHistorySnapshot | null | undefined,
  pickId: number
) {
  const value = snapshot?.starByPickId?.[String(pickId)];
  return typeof value === "number" ? value : null;
}

export function isNbaSnapshotTopPick(
  snapshot: NbaHistorySnapshot | null | undefined,
  pickId: number
) {
  return getNbaSnapshotTopPickIds(snapshot).includes(pickId);
}

export function isNbaSnapshotBestValuePick(
  snapshot: NbaHistorySnapshot | null | undefined,
  pickId: number
) {
  return getNbaSnapshotBestValueIds(snapshot).includes(pickId);
}

export function isNbaSnapshotOfficialPick(
  snapshot: NbaHistorySnapshot | null | undefined,
  pickId: number
) {
  return isNbaSnapshotTopPick(snapshot, pickId) || isNbaSnapshotBestValuePick(snapshot, pickId);
}

export async function captureNbaHistorySnapshot(pickDate: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("*")
    .eq("pick_date", pickDate)
    .eq("sport", "NBA");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as NbaSnapshotPickRow[];
  const snapshot = buildNbaHistorySnapshot(rows, pickDate);
  const overrideRow = await getCachedData(getSnapshotOverrideCacheKey(pickDate));
  const override = (overrideRow?.data as NbaHistorySnapshotOverride | null) ?? null;
  const resolvedSnapshot = applyNbaHistorySnapshotOverride(snapshot, override);
  await setNbaHistorySnapshot(resolvedSnapshot);
  return resolvedSnapshot;
}
