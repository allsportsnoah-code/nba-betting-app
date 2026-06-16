import GradesFilterSelect from "@/app/components/GradesFilterSelect";
import {
  isMlbSnapshotBestValuePick,
  isMlbSnapshotOfficialPick,
  isMlbSnapshotTopPick,
  type MlbHistorySnapshot,
  type MlbHistorySnapshotOverride,
} from "@/lib/mlbHistorySnapshot";
import {
  isNbaSnapshotBestValuePick,
  isNbaSnapshotOfficialPick,
  isNbaSnapshotTopPick,
  type NbaHistorySnapshot,
  type NbaHistorySnapshotOverride,
} from "@/lib/nbaHistorySnapshot";
import { rankPublicFreePickRowsForHistory } from "@/lib/publicFreePicks";
import {
  getFreshPublicFreePickIds,
  getPublicFreePickHistoryCacheKey,
  type PublicFreePickHistorySnapshot,
} from "@/lib/publicFreePickHistory";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { americanToProfitPerUnit } from "@/lib/units";

export const dynamic = "force-dynamic";

type PerformancePick = {
  id: number;
  pick_date: string;
  sport: string;
  game_start_time?: string | null;
  created_at?: string | null;
  graded_at?: string | null;
  market_scope?: string | null;
  status: "pending" | "win" | "loss" | "push" | "postponed" | "voided";
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  side: string;
  units_result?: number | null;
  odds_taken?: number | null;
  line_taken?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  market_type?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
};

type PerformanceSnapshotMap = Map<
  string,
  {
    mlb: MlbHistorySnapshot | null;
    nba: NbaHistorySnapshot | null;
    publicFreePicks: PublicFreePickHistorySnapshot | null;
  }
>;

type SnapshotCacheRow = {
  cache_key: string;
  data: unknown;
};

function getMlbSnapshot(snapshotByDate: PerformanceSnapshotMap | null | undefined, pickDate: string) {
  return snapshotByDate?.get(pickDate)?.mlb ?? null;
}

function getNbaSnapshot(snapshotByDate: PerformanceSnapshotMap | null | undefined, pickDate: string) {
  return snapshotByDate?.get(pickDate)?.nba ?? null;
}

function getPublicFreePickIds(snapshotByDate: PerformanceSnapshotMap | null | undefined, pickDate: string) {
  const snapshot = snapshotByDate?.get(pickDate);
  return getFreshPublicFreePickIds(snapshot?.publicFreePicks, [snapshot?.mlb, snapshot?.nba]);
}

function getMlbSnapshotCacheKey(pickDate: string) {
  return `mlb_history_snapshot_${pickDate}`;
}

function getMlbSnapshotOverrideCacheKey(pickDate: string) {
  return `mlb_history_snapshot_override_${pickDate}`;
}

function getNbaSnapshotCacheKey(pickDate: string) {
  return `nba_history_snapshot_${pickDate}`;
}

function getNbaSnapshotOverrideCacheKey(pickDate: string) {
  return `nba_history_snapshot_override_${pickDate}`;
}

function applyMlbSnapshotOverride(
  snapshot: MlbHistorySnapshot | null,
  override: MlbHistorySnapshotOverride | null | undefined
) {
  if (!snapshot || !override) return snapshot;

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
  } satisfies MlbHistorySnapshot;
}

function applyNbaSnapshotOverride(
  snapshot: NbaHistorySnapshot | null,
  override: NbaHistorySnapshotOverride | null | undefined
) {
  if (!snapshot || !override) return snapshot;

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
  } satisfies NbaHistorySnapshot;
}

type BreakdownRow = {
  label: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  netUnits: number;
};

type MonthlyGradeReport = {
  monthKey: string;
  monthLabel: string;
  settledPicks: number;
  pendingPicks: number;
  bettingDays: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  netUnits: number;
  grade: string;
  gradeScore: number;
  bestMarket: BreakdownRow | null;
  worstMarket: BreakdownRow | null;
  bestDay: { pickDate: string; netUnits: number } | null;
  worstDay: { pickDate: string; netUnits: number } | null;
  positives: string[];
  negatives: string[];
};

const GRADES_PAGE_SIZE = 1000;
const FREE_PICK_STAKE_UNITS = 2;
const STANDARD_PICK_STAKE_UNITS = 1;
const GRADES_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "game_start_time",
  "status",
  "game_label",
  "home_team",
  "away_team",
  "player_name",
  "side",
  "units_result",
  "odds_taken",
  "line_taken",
  "projected_line",
  "market_line",
  "projected_home_score",
  "projected_away_score",
  "edge",
  "edge_label",
  "confidence_score",
  "market_type",
  "is_top_pick",
  "top_pick_rank",
  "notes",
  "created_at",
  "graded_at",
].join(",");

function getCurrentBettingDateEt() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(
    anchor.getUTCDate()
  ).padStart(2, "0")}`;
}

function getResolvedStatus(status: PerformancePick["status"]) {
  return status === "postponed" || status === "voided" ? "push" : status;
}

function formatEtDateFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getEtCalendarDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) return null;
  return formatEtDateFromParts(year, month, day);
}

function getGradesCalendarDate(row: Pick<PerformancePick, "pick_date" | "game_start_time">) {
  return getEtCalendarDate(row.game_start_time) ?? row.pick_date;
}

function getDedupeDate(row: PerformancePick) {
  if (row.sport === "MLB") return getGradesCalendarDate(row);
  return row.pick_date ?? "";
}

function getDedupeKey(row: PerformancePick) {
  return [
    getDedupeDate(row),
    row.sport ?? "",
    row.market_scope ?? "",
    row.market_type ?? "",
    row.game_label ?? "",
    row.player_name ?? "",
    row.side ?? "",
    row.line_taken ?? "",
  ].join("::");
}

function getTimeValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isSettledRow(row: PerformancePick) {
  return Boolean(row.status && row.status !== "pending");
}

function choosePreferredPick(existing: PerformancePick, next: PerformancePick) {
  const existingSettled = isSettledRow(existing);
  const nextSettled = isSettledRow(next);

  if (existingSettled !== nextSettled) {
    return nextSettled ? next : existing;
  }

  const existingTime = Math.max(getTimeValue(existing.graded_at), getTimeValue(existing.created_at));
  const nextTime = Math.max(getTimeValue(next.graded_at), getTimeValue(next.created_at));

  return nextTime >= existingTime ? next : existing;
}

function dedupePicks(rows: PerformancePick[]) {
  const deduped = new Map<string, PerformancePick>();

  for (const row of rows) {
    const key = getDedupeKey(row);
    const existing = deduped.get(key);
    deduped.set(key, existing ? choosePreferredPick(existing, row) : row);
  }

  return Array.from(deduped.values());
}

function normalizePickDate(row: PerformancePick): PerformancePick {
  if (row.sport !== "MLB") return row;

  const displayDate = getGradesCalendarDate(row);
  if (!displayDate || displayDate === row.pick_date) return row;

  return {
    ...row,
    pick_date: displayDate,
  };
}

async function getPicks(params: { sport: string; scope: string }) {
  const supabase = getSupabaseServer();
  const rows: PerformancePick[] = [];

  for (let from = 0; ; from += GRADES_PAGE_SIZE) {
    let query = supabase
      .from("picks")
      .select(GRADES_PICK_SELECT)
      .or("is_top_pick.eq.true,notes.eq.best_value")
      .order("is_top_pick", { ascending: false })
      .order("top_pick_rank", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, from + GRADES_PAGE_SIZE - 1);

    if (params.sport !== "all") query = query.eq("sport", params.sport);
    if (params.scope !== "all") query = query.eq("market_scope", params.scope);

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const page = ((data ?? []) as unknown) as PerformancePick[];
    rows.push(...page);

    if (page.length < GRADES_PAGE_SIZE) break;
  }

  return dedupePicks(rows.map(normalizePickDate));
}

async function getSnapshotMap(mlbDates: string[], nbaDates: string[]): Promise<PerformanceSnapshotMap> {
  const allDates = Array.from(new Set([...mlbDates, ...nbaDates]));
  const cacheKeys = [
    ...mlbDates.flatMap((pickDate) => [
      getMlbSnapshotCacheKey(pickDate),
      getMlbSnapshotOverrideCacheKey(pickDate),
    ]),
    ...nbaDates.flatMap((pickDate) => [
      getNbaSnapshotCacheKey(pickDate),
      getNbaSnapshotOverrideCacheKey(pickDate),
    ]),
    ...allDates.map(getPublicFreePickHistoryCacheKey),
  ];

  if (cacheKeys.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("cached_market_data")
    .select("cache_key,data")
    .in("cache_key", cacheKeys);

  if (error) {
    throw new Error(error.message);
  }

  const cacheByKey = new Map(
    (((data ?? []) as unknown) as SnapshotCacheRow[]).map((row) => [row.cache_key, row.data])
  );

  return new Map(
    allDates.map((pickDate) => {
      const mlbSnapshot = mlbDates.includes(pickDate)
        ? (cacheByKey.get(getMlbSnapshotCacheKey(pickDate)) as MlbHistorySnapshot | null | undefined) ?? null
        : null;
      const mlbOverride = mlbDates.includes(pickDate)
        ? (cacheByKey.get(getMlbSnapshotOverrideCacheKey(pickDate)) as MlbHistorySnapshotOverride | null | undefined) ?? null
        : null;
      const nbaSnapshot = nbaDates.includes(pickDate)
        ? (cacheByKey.get(getNbaSnapshotCacheKey(pickDate)) as NbaHistorySnapshot | null | undefined) ?? null
        : null;
      const nbaOverride = nbaDates.includes(pickDate)
        ? (cacheByKey.get(getNbaSnapshotOverrideCacheKey(pickDate)) as NbaHistorySnapshotOverride | null | undefined) ?? null
        : null;
      const publicFreePicks =
        (cacheByKey.get(getPublicFreePickHistoryCacheKey(pickDate)) as PublicFreePickHistorySnapshot | null | undefined) ??
        null;

      return [
        pickDate,
        {
          mlb: applyMlbSnapshotOverride(mlbSnapshot, mlbOverride),
          nba: applyNbaSnapshotOverride(nbaSnapshot, nbaOverride),
          publicFreePicks,
        },
      ] as const;
    })
  );
}

function isHistoricalTopPick(row: PerformancePick, snapshotByDate?: PerformanceSnapshotMap) {
  const mlbSnapshot = getMlbSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotTopPick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getNbaSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotTopPick(nbaSnapshot, row.id);
  }

  return Boolean(row.is_top_pick);
}

function isHistoricalBestValuePick(row: PerformancePick, snapshotByDate?: PerformanceSnapshotMap) {
  const mlbSnapshot = getMlbSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotBestValuePick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getNbaSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotBestValuePick(nbaSnapshot, row.id);
  }

  return row.notes === "best_value";
}

function isOfficialHistoricalPick(row: PerformancePick, snapshotByDate: PerformanceSnapshotMap) {
  const mlbSnapshot = getMlbSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotOfficialPick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getNbaSnapshot(snapshotByDate, row.pick_date);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotOfficialPick(nbaSnapshot, row.id);
  }

  return Boolean(row.is_top_pick) || row.notes === "best_value";
}

function filterBySport(rows: PerformancePick[], sport: string) {
  if (sport === "all") return rows;
  return rows.filter((row) => row.sport === sport);
}

function filterByScope(rows: PerformancePick[], scope: string) {
  if (scope === "all") return rows;
  return rows.filter((row) => row.market_scope === scope);
}

function buildFreePickRows(rows: PerformancePick[], snapshotByDate: PerformanceSnapshotMap) {
  const grouped = new Map<string, PerformancePick[]>();

  for (const row of rows) {
    const existing = grouped.get(row.pick_date) ?? [];
    existing.push(row);
    grouped.set(row.pick_date, existing);
  }

  return Array.from(grouped.entries()).flatMap(([pickDate, dayRows]) =>
    rankPublicFreePickRowsForHistory(dayRows, getPublicFreePickIds(snapshotByDate, pickDate))
  );
}

function getGradeStakeUnits(row: PerformancePick, freePickIds?: Set<number>) {
  return freePickIds?.has(row.id) ? FREE_PICK_STAKE_UNITS : STANDARD_PICK_STAKE_UNITS;
}

function getGradeUnits(row: PerformancePick, freePickIds?: Set<number>) {
  const status = getResolvedStatus(row.status);
  if (status === "pending" || status === "push") return 0;

  const stakeUnits = getGradeStakeUnits(row, freePickIds);
  if (status === "loss") return -stakeUnits;

  if (row.odds_taken !== null && row.odds_taken !== undefined) {
    return Number((americanToProfitPerUnit(row.odds_taken) * stakeUnits).toFixed(2));
  }

  return Number((Number(row.units_result ?? 0) * stakeUnits).toFixed(2));
}

function buildBreakdownByMarket(rows: PerformancePick[], freePickIds?: Set<number>) {
  const grouped = new Map<string, BreakdownRow>();

  for (const row of rows) {
    const label = row.market_type ?? "unknown";
    if (!grouped.has(label)) {
      grouped.set(label, {
        label,
        picks: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        winRate: 0,
        netUnits: 0,
      });
    }

    const entry = grouped.get(label);
    if (!entry) continue;

    entry.picks += 1;
    entry.netUnits = Number((entry.netUnits + getGradeUnits(row, freePickIds)).toFixed(2));
    const resolvedStatus = getResolvedStatus(row.status);
    if (resolvedStatus === "win") entry.wins += 1;
    if (resolvedStatus === "loss") entry.losses += 1;
    if (resolvedStatus === "push") entry.pushes += 1;
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const decisions = entry.wins + entry.losses;
      return {
        ...entry,
        winRate: decisions > 0 ? Number(((entry.wins / decisions) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.netUnits - a.netUnits);
}

function buildDailyNetRows(rows: PerformancePick[], freePickIds?: Set<number>) {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    if (getResolvedStatus(row.status) === "pending") continue;
    const dateKey = getGradesCalendarDate(row);
    const nextValue = Number(((grouped.get(dateKey) ?? 0) + getGradeUnits(row, freePickIds)).toFixed(2));
    grouped.set(dateKey, nextValue);
  }

  return Array.from(grouped.entries())
    .map(([pickDate, netUnits]) => ({ pickDate, netUnits }))
    .sort((a, b) => a.pickDate.localeCompare(b.pickDate));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLetterGrade(score: number) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}

function capScoreForTopGrades(
  rawScore: number,
  settledPicks: number,
  netUnits: number,
  winRate: number
) {
  let score = rawScore;

  if (settledPicks < 35 || netUnits < 12 || winRate < 63) {
    score = Math.min(score, 96.9);
  }

  if (settledPicks < 25 || netUnits < 9 || winRate < 60) {
    score = Math.min(score, 92.9);
  }

  if (settledPicks < 16 || netUnits < 6 || winRate < 57) {
    score = Math.min(score, 89.9);
  }

  if (settledPicks < 10 || netUnits < 3 || winRate < 53) {
    score = Math.min(score, 86.9);
  }

  return Number(score.toFixed(1));
}

function getGradeColorClass(grade: string) {
  if (grade.startsWith("A")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (grade.startsWith("B")) return "border-teal-200 bg-teal-50 text-teal-800";
  if (grade.startsWith("C")) return "border-amber-200 bg-amber-50 text-amber-800";
  if (grade.startsWith("D")) return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function formatMonthDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${month}/${day}`;
}

function formatMarketLabel(marketType: string | null | undefined) {
  if (!marketType) return "Unknown";
  if (marketType === "moneyline") return "Moneyline";
  if (marketType === "spread") return "Spread / Run Line";
  if (marketType === "total") return "Game Total";
  return marketType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSignedUnits(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function getBoardStakingNote(board: string) {
  if (board === "free") {
    return "Free Picks grades use 2u per pick, matching the Free Picks performance view.";
  }

  return "Top Picks, Best Value, and All Official Picks grades use 1u per pick.";
}

function buildMonthlyGradeReport(
  monthKey: string,
  rows: PerformancePick[],
  freePickIds?: Set<number>
): MonthlyGradeReport {
  const settled = rows.filter((row) => getResolvedStatus(row.status) !== "pending");
  const pendingPicks = rows.length - settled.length;
  const wins = settled.filter((row) => getResolvedStatus(row.status) === "win").length;
  const losses = settled.filter((row) => getResolvedStatus(row.status) === "loss").length;
  const pushes = settled.filter((row) => getResolvedStatus(row.status) === "push").length;
  const decisions = wins + losses;
  const winRate = decisions > 0 ? Number(((wins / decisions) * 100).toFixed(1)) : 0;
  const netUnits = Number(
    settled.reduce((total, row) => total + getGradeUnits(row, freePickIds), 0).toFixed(2)
  );
  const bettingDays = new Set(rows.map((row) => getGradesCalendarDate(row))).size;
  const marketBreakdown = buildBreakdownByMarket(settled, freePickIds);
  const bestMarket = marketBreakdown[0] ?? null;
  const worstMarket = marketBreakdown.length > 0 ? marketBreakdown[marketBreakdown.length - 1] : null;
  const dailyBreakdown = buildDailyNetRows(settled, freePickIds);
  const bestDay = dailyBreakdown.length > 0 ? dailyBreakdown.reduce((best, row) => (row.netUnits > best.netUnits ? row : best)) : null;
  const worstDay = dailyBreakdown.length > 0 ? dailyBreakdown.reduce((worst, row) => (row.netUnits < worst.netUnits ? row : worst)) : null;

  const sampleAdjustment =
    settled.length >= 40 ? 5 : settled.length >= 20 ? 4 : settled.length >= 10 ? 2 : settled.length >= 6 ? 0 : -2;
  const rawScore = Number(
    clamp(70 + clamp(netUnits * 2, -18, 18) + clamp((winRate - 50) * 1, -18, 18) + sampleAdjustment, 0, 100).toFixed(1)
  );
  const score = capScoreForTopGrades(rawScore, settled.length, netUnits, winRate);
  const grade = getLetterGrade(score);

  const positives: string[] = [];
  const negatives: string[] = [];

  if (netUnits > 0) {
    positives.push(`Finished ${formatSignedUnits(netUnits)} across ${settled.length} settled picks.`);
  } else if (netUnits === 0 && settled.length > 0) {
    positives.push(`Finished flat over ${settled.length} settled picks.`);
  }

  if (winRate >= 55 && decisions > 0) {
    positives.push(`Won ${wins}-${losses}${pushes > 0 ? `-${pushes}` : ""} with a ${winRate}% hit rate.`);
  }

  if (bestMarket && bestMarket.netUnits > 0) {
    positives.push(`${formatMarketLabel(bestMarket.label)} led the month at ${formatSignedUnits(bestMarket.netUnits)}.`);
  }

  if (bestDay && bestDay.netUnits > 0.4) {
    positives.push(`${formatMonthDay(bestDay.pickDate)} was the best day at ${formatSignedUnits(bestDay.netUnits)}.`);
  }

  if (netUnits < 0) {
    negatives.push(`Finished ${formatSignedUnits(netUnits)} on the month.`);
  }

  if (winRate < 50 && decisions > 0) {
    negatives.push(`Win rate slipped to ${winRate}% at ${wins}-${losses}.`);
  }

  if (worstMarket && worstMarket.netUnits < 0) {
    negatives.push(`${formatMarketLabel(worstMarket.label)} hurt the most at ${formatSignedUnits(worstMarket.netUnits)}.`);
  }

  if (worstDay && worstDay.netUnits < -0.4) {
    negatives.push(`${formatMonthDay(worstDay.pickDate)} was the toughest day at ${formatSignedUnits(worstDay.netUnits)}.`);
  }

  if (settled.length < 6) {
    negatives.push(`Only ${settled.length} settled picks so far, so this grade can swing fast.`);
  }

  if (positives.length === 0) {
    positives.push("There was not enough separation yet to call out a real strength.");
  }

  if (negatives.length === 0) {
    negatives.push("There was not a major leak this month beyond normal variance.");
  }

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    settledPicks: settled.length,
    pendingPicks,
    bettingDays,
    wins,
    losses,
    pushes,
    winRate,
    netUnits,
    grade,
    gradeScore: score,
    bestMarket,
    worstMarket,
    bestDay,
    worstDay,
    positives: positives.slice(0, 3),
    negatives: negatives.slice(0, 3),
  };
}

function buildBoardFilteredRows(
  rows: PerformancePick[],
  board: string,
  snapshotByDate: PerformanceSnapshotMap
) {
  if (board === "top") {
    return rows.filter((row) => isHistoricalTopPick(row, snapshotByDate));
  }

  if (board === "value") {
    return rows.filter((row) => isHistoricalBestValuePick(row, snapshotByDate));
  }

  return rows;
}

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; scope?: string; board?: string }>;
}) {
  const params = await searchParams;
  const sport =
    params.sport === "NBA" || params.sport === "MLB" || params.sport === "SOCCER"
      ? params.sport
      : "all";
  const scope = params.scope === "team" || params.scope === "player_prop" ? params.scope : "all";
  const board =
    params.board === "top" || params.board === "value" || params.board === "free" ? params.board : "all";

  const picks = await getPicks({ sport, scope });
  const currentBettingDate = getCurrentBettingDateEt();
  const datedRows = picks.filter(
    (pick) => pick.pick_date <= currentBettingDate
  );
  const mlbDates = Array.from(new Set(datedRows.filter((pick) => pick.sport === "MLB").map((pick) => pick.pick_date)));
  const nbaDates = Array.from(new Set(datedRows.filter((pick) => pick.sport === "NBA").map((pick) => pick.pick_date)));
  const snapshotByDate = await getSnapshotMap(mlbDates, nbaDates);

  const officialRows = datedRows.filter((pick) => isOfficialHistoricalPick(pick, snapshotByDate));
  const scopedRows = filterByScope(filterBySport(officialRows, sport), scope);
  const freePickRows = buildFreePickRows(scopedRows, snapshotByDate);
  const freePickIds = new Set(freePickRows.map((row) => row.id));
  const filteredRows =
    board === "free" ? freePickRows : buildBoardFilteredRows(scopedRows, board, snapshotByDate);
  const gradeFreePickIds = board === "free" ? freePickIds : undefined;

  const groupedByMonth = new Map<string, PerformancePick[]>();

  for (const row of filteredRows) {
    const monthKey = getGradesCalendarDate(row).slice(0, 7);
    const existing = groupedByMonth.get(monthKey) ?? [];
    existing.push(row);
    groupedByMonth.set(monthKey, existing);
  }

  const reports = Array.from(groupedByMonth.entries())
    .map(([monthKey, monthRows]) => buildMonthlyGradeReport(monthKey, monthRows, gradeFreePickIds))
    .filter((report) => report.settledPicks > 0)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const profitableMonths = reports.filter((report) => report.netUnits > 0).length;
  const bestMonth = reports.reduce<MonthlyGradeReport | null>(
    (best, report) => (!best || report.netUnits > best.netUnits ? report : best),
    null
  );
  const toughestMonth = reports.reduce<MonthlyGradeReport | null>(
    (worst, report) => (!worst || report.netUnits < worst.netUnits ? report : worst),
    null
  );
  const averageGradeScore =
    reports.length > 0
      ? Number((reports.reduce((total, report) => total + report.gradeScore, 0) / reports.length).toFixed(1))
      : 0;
  const averageGrade = getLetterGrade(averageGradeScore);

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800/80 mb-2">
          Monthly Report Card
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Grades</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Grades each month off settled official picks only. Net units carry the most weight, win rate helps break ties, tiny samples get marked down a bit, and the top grades now need real profit plus enough settled volume to earn them.
        </p>
        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600">
          {getBoardStakingNote(board)}
        </p>
      </div>

      <GradesFilterSelect sport={sport} scope={scope} board={board} />

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="app-panel rounded-3xl p-5">
          <div className="text-sm text-slate-500">Months Graded</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{reports.length}</div>
        </div>
        <div className="app-panel rounded-3xl p-5">
          <div className="text-sm text-slate-500">Profitable Months</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">{profitableMonths}</div>
        </div>
        <div className="app-panel rounded-3xl p-5">
          <div className="text-sm text-slate-500">Average Grade</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{averageGrade}</div>
          {reports.length > 0 && <div className="mt-2 text-sm text-slate-600">{averageGradeScore}/100 score</div>}
        </div>
        <div className="app-panel rounded-3xl p-5">
          <div className="text-sm text-slate-500">Best Month</div>
          {bestMonth ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{bestMonth.monthLabel}</div>
              <div className="mt-2 text-sm text-emerald-700">{formatSignedUnits(bestMonth.netUnits)}</div>
            </>
          ) : (
            <div className="mt-2 text-sm text-slate-600">No settled months yet</div>
          )}
        </div>
      </div>

      {toughestMonth && (
        <div className="app-panel rounded-3xl p-5 mb-6">
          <div className="text-sm text-slate-500">Toughest Month So Far</div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{toughestMonth.monthLabel}</div>
          <div className="mt-1 text-sm text-rose-700">{formatSignedUnits(toughestMonth.netUnits)}</div>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="app-panel rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-950">No settled months for this filter yet.</h2>
          <p className="mt-2 text-slate-600">
            Try a wider scope or switch back to all official picks.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {reports.map((report) => (
            <section key={report.monthKey} className="app-panel rounded-3xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">{report.monthLabel}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {report.settledPicks} settled picks across {report.bettingDays} betting days
                    {report.pendingPicks > 0 ? ` | ${report.pendingPicks} still pending` : ""}
                  </p>
                </div>
                <div
                  className={`rounded-2xl border px-5 py-3 text-center ${getGradeColorClass(report.grade)}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em]">Letter Grade</div>
                  <div className="mt-1 text-3xl font-semibold">{report.grade}</div>
                  <div className="mt-1 text-sm">{report.gradeScore}/100</div>
                </div>
              </div>

              <div className="grid gap-4 mt-5 md:grid-cols-5">
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Record</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {report.wins}-{report.losses}-{report.pushes}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Win Rate</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">{report.winRate}%</div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Net Units</div>
                  <div
                    className={
                      report.netUnits >= 0
                        ? "mt-2 text-2xl font-semibold text-emerald-700"
                        : "mt-2 text-2xl font-semibold text-rose-700"
                    }
                  >
                    {formatSignedUnits(report.netUnits)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Best Market</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {report.bestMarket ? formatMarketLabel(report.bestMarket.label) : "N/A"}
                  </div>
                  {report.bestMarket && (
                    <div className="mt-1 text-sm text-emerald-700">{formatSignedUnits(report.bestMarket.netUnits)}</div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Worst Market</div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {report.worstMarket ? formatMarketLabel(report.worstMarket.label) : "N/A"}
                  </div>
                  {report.worstMarket && (
                    <div className="mt-1 text-sm text-rose-700">{formatSignedUnits(report.worstMarket.netUnits)}</div>
                  )}
                </div>
              </div>

              <div className="grid gap-5 mt-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-5 py-4">
                  <h3 className="text-lg font-semibold text-emerald-950">What Helped</h3>
                  <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                    {report.positives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-5 py-4">
                  <h3 className="text-lg font-semibold text-rose-950">What Hurt</h3>
                  <ul className="mt-3 space-y-2 text-sm text-rose-950">
                    {report.negatives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
