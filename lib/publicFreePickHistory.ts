import { getCachedData, setCachedData } from "@/lib/cache";
import {
  getMlbHistorySnapshot,
  getMlbSnapshotPropBestValueIds,
  getMlbSnapshotPropTopPickIds,
  getMlbSnapshotTeamBestValueIds,
  getMlbSnapshotTeamTopPickIds,
} from "@/lib/mlbHistorySnapshot";
import {
  getNbaHistorySnapshot,
  getNbaSnapshotPropBestValueIds,
  getNbaSnapshotPropTopPickIds,
  getNbaSnapshotTeamBestValueIds,
  getNbaSnapshotTeamTopPickIds,
} from "@/lib/nbaHistorySnapshot";
import { rankPublicFreePickRows, type PublicFreePickLike } from "@/lib/publicFreePicks";
import { getSupabaseServer } from "@/lib/supabaseServer";

export type PublicFreePickHistorySnapshot = {
  pickDate: string;
  updatedAt: string;
  freePickIds: number[];
};

type PublicFreePickSourceSnapshot = {
  updatedAt?: string | null;
} | null | undefined;

const PUBLIC_FREE_PICK_HISTORY_SIZE = 3;
const PUBLIC_FREE_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "market_type",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "player_name",
  "side",
  "line_taken",
  "odds_taken",
  "projected_line",
  "market_line",
  "edge",
  "edge_label",
  "confidence_score",
  "is_top_pick",
  "top_pick_rank",
  "notes",
  "status",
  "projected_home_score",
  "projected_away_score",
].join(",");

type PublicFreePickHistoryRow = PublicFreePickLike & {
  side: string;
};

function getUpdatedAtMs(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isPublicFreePickHistoryFresh(
  history: PublicFreePickHistorySnapshot | null | undefined,
  sourceSnapshots: PublicFreePickSourceSnapshot[]
) {
  if (!history) return false;

  const historyUpdatedAt = getUpdatedAtMs(history.updatedAt);
  const latestSourceUpdatedAt = sourceSnapshots.reduce<number | null>((latest, snapshot) => {
    const sourceUpdatedAt = getUpdatedAtMs(snapshot?.updatedAt);
    if (sourceUpdatedAt === null) return latest;
    return latest === null ? sourceUpdatedAt : Math.max(latest, sourceUpdatedAt);
  }, null);

  if (latestSourceUpdatedAt === null) return true;
  return historyUpdatedAt !== null && historyUpdatedAt >= latestSourceUpdatedAt;
}

export function getFreshPublicFreePickIds(
  history: PublicFreePickHistorySnapshot | null | undefined,
  sourceSnapshots: PublicFreePickSourceSnapshot[]
) {
  return isPublicFreePickHistoryFresh(history, sourceSnapshots) ? history?.freePickIds ?? null : null;
}

export function getPublicFreePickHistoryCacheKey(pickDate: string) {
  return `public_free_pick_history_${pickDate}`;
}

export async function getPublicFreePickHistory(pickDate: string) {
  const cached = await getCachedData(getPublicFreePickHistoryCacheKey(pickDate));
  return (cached?.data as PublicFreePickHistorySnapshot | null) ?? null;
}

export async function setPublicFreePickHistory(snapshot: PublicFreePickHistorySnapshot) {
  await setCachedData(getPublicFreePickHistoryCacheKey(snapshot.pickDate), snapshot);
}

function buildOfficialIds({
  mlbSnapshot,
  nbaSnapshot,
}: {
  mlbSnapshot: Awaited<ReturnType<typeof getMlbHistorySnapshot>>;
  nbaSnapshot: Awaited<ReturnType<typeof getNbaHistorySnapshot>>;
}) {
  const mlbIds = new Set([
    ...getMlbSnapshotTeamTopPickIds(mlbSnapshot),
    ...getMlbSnapshotTeamBestValueIds(mlbSnapshot),
    ...getMlbSnapshotPropTopPickIds(mlbSnapshot),
    ...getMlbSnapshotPropBestValueIds(mlbSnapshot),
  ]);
  const nbaIds = new Set([
    ...getNbaSnapshotTeamTopPickIds(nbaSnapshot),
    ...getNbaSnapshotTeamBestValueIds(nbaSnapshot),
    ...getNbaSnapshotPropTopPickIds(nbaSnapshot),
    ...getNbaSnapshotPropBestValueIds(nbaSnapshot),
  ]);

  return { mlbIds, nbaIds };
}

function isSnapshotBackedOfficialPick(
  row: PublicFreePickHistoryRow,
  officialIds: ReturnType<typeof buildOfficialIds>
) {
  if (row.sport === "MLB" && officialIds.mlbIds.size > 0) return officialIds.mlbIds.has(row.id);
  if (row.sport === "NBA" && officialIds.nbaIds.size > 0) return officialIds.nbaIds.has(row.id);
  return Boolean(row.is_top_pick) || row.notes === "best_value";
}

export async function capturePublicFreePickHistory(
  pickDate: string,
  options: { force?: boolean } = {}
) {
  const existing = await getPublicFreePickHistory(pickDate);

  const supabase = getSupabaseServer();
  const [mlbSnapshot, nbaSnapshot, rowsResult] = await Promise.all([
    getMlbHistorySnapshot(pickDate),
    getNbaHistorySnapshot(pickDate),
    supabase
      .from("picks")
      .select(PUBLIC_FREE_PICK_SELECT)
      .eq("pick_date", pickDate)
      .in("sport", ["MLB", "NBA"])
      .in("market_scope", ["team", "player_prop"])
      .order("is_top_pick", { ascending: false })
      .order("top_pick_rank", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  if (existing && !options.force && isPublicFreePickHistoryFresh(existing, [mlbSnapshot, nbaSnapshot])) {
    return existing;
  }

  const rows = ((rowsResult.data ?? []) as unknown as PublicFreePickHistoryRow[]).filter(
    (row) => typeof row.id === "number" && typeof row.side === "string" && row.side.trim().length > 0
  );
  const officialIds = buildOfficialIds({ mlbSnapshot, nbaSnapshot });
  const candidateRows = rows.filter((row) => isSnapshotBackedOfficialPick(row, officialIds));
  const freePickRows = rankPublicFreePickRows(candidateRows, { limit: PUBLIC_FREE_PICK_HISTORY_SIZE });
  const snapshot: PublicFreePickHistorySnapshot = {
    pickDate,
    updatedAt: new Date().toISOString(),
    freePickIds: freePickRows.map((row) => row.id),
  };

  await setPublicFreePickHistory(snapshot);
  return snapshot;
}
