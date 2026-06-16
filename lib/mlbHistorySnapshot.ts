import { getCachedData, setCachedData } from "@/lib/cache";
import { buildMlbLearningProfile } from "@/lib/mlbLearning";
import { getMlbFreePickStars, rankMlbFreePickRows, type MlbFreePickLike } from "@/lib/mlbFreePicks";
import {
  candidateKey,
  savedMlbTeamBoardKey,
  selectMlbTeamBoardCandidates,
  toSavedMlbTeamCandidate,
  type SavedMlbTeamBoardRow,
} from "@/lib/mlbPickRanking";
import {
  propBoardKey,
  selectMlbPropBoardCandidates,
  toSavedPropBoardCandidate,
  type SavedMlbPropBoardRow,
} from "@/lib/mlbPropBoard";
import { getSupabaseServer } from "@/lib/supabaseServer";

type SnapshotPickRow = MlbFreePickLike & {
  id: number;
  pick_date?: string | null;
  top_pick_rank?: number | null;
};

type SnapshotTeamRow = SnapshotPickRow & SavedMlbTeamBoardRow;
type SnapshotPropRow = SnapshotPickRow & SavedMlbPropBoardRow;

export type MlbHistorySnapshot = {
  pickDate: string;
  updatedAt: string;
  starByPickId: Record<string, number>;
  teamTopPickIds: number[];
  teamBestValueIds: number[];
  propTopPickIds: number[];
  propBestValueIds: number[];
  freePickIds: number[];
};

export type MlbHistorySnapshotOverride = Partial<
  Pick<
    MlbHistorySnapshot,
    "starByPickId" | "teamTopPickIds" | "teamBestValueIds" | "propTopPickIds" | "propBestValueIds" | "freePickIds"
  >
>;

const MLB_OFFICIAL_BOARD_SIZE = 3;

function getSnapshotCacheKey(pickDate: string) {
  return `mlb_history_snapshot_${pickDate}`;
}

function getSnapshotOverrideCacheKey(pickDate: string) {
  return `mlb_history_snapshot_override_${pickDate}`;
}

function capSnapshotBoardIds(ids: number[] | null | undefined) {
  return (ids ?? []).slice(0, MLB_OFFICIAL_BOARD_SIZE);
}

function applyMlbHistorySnapshotOverride(
  snapshot: MlbHistorySnapshot,
  override: MlbHistorySnapshotOverride | null | undefined
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
    freePickIds: override.freePickIds ?? snapshot.freePickIds,
  };
}

async function buildMlbHistorySnapshot(rows: SnapshotPickRow[], pickDate: string): Promise<MlbHistorySnapshot> {
  const learningProfile = await buildMlbLearningProfile();
  const teamRows = rows.filter(
    (row): row is SnapshotTeamRow => row.sport === "MLB" && row.market_scope === "team"
  );
  const propRows = rows.filter(
    (row): row is SnapshotPropRow => row.sport === "MLB" && row.market_scope === "player_prop"
  );

  const teamCandidates = teamRows
    .map((row) => toSavedMlbTeamCandidate(row, learningProfile))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const teamRowIdsByKey = new Map(teamRows.map((row) => [savedMlbTeamBoardKey(row), row.id]));
  const teamSelection = selectMlbTeamBoardCandidates(teamCandidates, learningProfile);
  const teamTopPickIds = teamSelection.topCandidates
    .map((candidate) => teamRowIdsByKey.get(candidateKey(candidate)))
    .filter((value): value is number => typeof value === "number")
    .slice(0, MLB_OFFICIAL_BOARD_SIZE);
  const teamBestValueIds = teamSelection.bestValueCandidates
    .map((candidate) => teamRowIdsByKey.get(candidateKey(candidate)))
    .filter((value): value is number => typeof value === "number")
    .slice(0, MLB_OFFICIAL_BOARD_SIZE);

  const propCandidates = propRows.map(toSavedPropBoardCandidate);
  const propRowIdsByKey = new Map(propRows.map((row) => [propBoardKey(row), row.id]));
  const propSelection = selectMlbPropBoardCandidates(propCandidates, learningProfile);
  const propTopPickIds = propSelection.topCandidates
    .map((candidate) => propRowIdsByKey.get(propBoardKey(candidate)))
    .filter((value): value is number => typeof value === "number")
    .slice(0, MLB_OFFICIAL_BOARD_SIZE);
  const propBestValueIds = propSelection.bestValueCandidates
    .map((candidate) => propRowIdsByKey.get(propBoardKey(candidate)))
    .filter((value): value is number => typeof value === "number")
    .slice(0, MLB_OFFICIAL_BOARD_SIZE);

  const canonicalOfficialIds = new Set([
    ...teamTopPickIds,
    ...teamBestValueIds,
    ...propTopPickIds,
    ...propBestValueIds,
  ]);
  const officialRows = rows.filter((row) => canonicalOfficialIds.has(row.id));
  const freePickRows = rankMlbFreePickRows(officialRows);
  const starByPickId = Object.fromEntries(officialRows.map((row) => [String(row.id), getMlbFreePickStars(row)]));

  return {
    pickDate,
    updatedAt: new Date().toISOString(),
    starByPickId,
    teamTopPickIds,
    teamBestValueIds,
    propTopPickIds,
    propBestValueIds,
    freePickIds: freePickRows.map((row) => row.id).slice(0, MLB_OFFICIAL_BOARD_SIZE),
  };
}

export async function getMlbHistorySnapshot(pickDate: string) {
  const cached = await getCachedData(getSnapshotCacheKey(pickDate));
  const snapshot = (cached?.data as MlbHistorySnapshot | null) ?? null;
  if (!snapshot) return null;

  const overrideRow = await getCachedData(getSnapshotOverrideCacheKey(pickDate));
  const override = (overrideRow?.data as MlbHistorySnapshotOverride | null) ?? null;
  return applyMlbHistorySnapshotOverride(snapshot, override);
}

export async function setMlbHistorySnapshot(snapshot: MlbHistorySnapshot) {
  await setCachedData(getSnapshotCacheKey(snapshot.pickDate), snapshot);
}

export async function setMlbHistorySnapshotOverride(
  pickDate: string,
  override: MlbHistorySnapshotOverride
) {
  await setCachedData(getSnapshotOverrideCacheKey(pickDate), override);
}

export function getMlbHistorySnapshotStar(
  snapshot: MlbHistorySnapshot | null | undefined,
  pickId: number
) {
  const value = snapshot?.starByPickId?.[String(pickId)];
  return typeof value === "number" ? value : null;
}

export function getMlbSnapshotTeamTopPickIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.teamTopPickIds);
}

export function getMlbSnapshotTeamBestValueIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.teamBestValueIds);
}

export function getMlbSnapshotPropTopPickIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.propTopPickIds);
}

export function getMlbSnapshotPropBestValueIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.propBestValueIds);
}

export function getMlbSnapshotTopPickIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return [
    ...getMlbSnapshotTeamTopPickIds(snapshot),
    ...getMlbSnapshotPropTopPickIds(snapshot),
  ];
}

export function getMlbSnapshotBestValueIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return [
    ...getMlbSnapshotTeamBestValueIds(snapshot),
    ...getMlbSnapshotPropBestValueIds(snapshot),
  ];
}

export function getMlbSnapshotFreePickIds(snapshot: MlbHistorySnapshot | null | undefined) {
  return capSnapshotBoardIds(snapshot?.freePickIds);
}

export function isMlbSnapshotTopPick(
  snapshot: MlbHistorySnapshot | null | undefined,
  pickId: number
) {
  return getMlbSnapshotTopPickIds(snapshot).includes(pickId);
}

export function isMlbSnapshotBestValuePick(
  snapshot: MlbHistorySnapshot | null | undefined,
  pickId: number
) {
  return getMlbSnapshotBestValueIds(snapshot).includes(pickId);
}

export function isMlbSnapshotOfficialPick(
  snapshot: MlbHistorySnapshot | null | undefined,
  pickId: number
) {
  return isMlbSnapshotTopPick(snapshot, pickId) || isMlbSnapshotBestValuePick(snapshot, pickId);
}

export function getSnapshotOrderedRows<T extends { id: number }>(
  rows: T[],
  orderedIds: number[] | null | undefined
) {
  if (!orderedIds || orderedIds.length === 0) return [] as T[];

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return orderedIds
    .map((id) => rowById.get(id))
    .filter((row): row is T => Boolean(row));
}

export async function captureMlbHistorySnapshot(pickDate: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("*")
    .eq("pick_date", pickDate)
    .eq("sport", "MLB");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SnapshotPickRow[];
  const snapshot = await buildMlbHistorySnapshot(rows, pickDate);
  const overrideRow = await getCachedData(getSnapshotOverrideCacheKey(pickDate));
  const override = (overrideRow?.data as MlbHistorySnapshotOverride | null) ?? null;
  const resolvedSnapshot = applyMlbHistorySnapshotOverride(snapshot, override);
  await setMlbHistorySnapshot(resolvedSnapshot);
  return resolvedSnapshot;
}
