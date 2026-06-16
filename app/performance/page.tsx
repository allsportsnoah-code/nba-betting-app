import PerformanceChart from "@/app/components/PerformanceChart";
import PerformanceRangeSelect from "@/app/components/PerformanceRangeSelect";
import FoldPanel from "@/app/components/FoldPanel";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  getMlbHistorySnapshot,
  isMlbSnapshotBestValuePick,
  isMlbSnapshotOfficialPick,
  isMlbSnapshotTopPick,
  getMlbHistorySnapshotStar,
  type MlbHistorySnapshot,
} from "@/lib/mlbHistorySnapshot";
import {
  getNbaHistorySnapshot,
  getNbaHistorySnapshotStar,
  isNbaSnapshotBestValuePick,
  isNbaSnapshotOfficialPick,
  isNbaSnapshotTopPick,
  type NbaHistorySnapshot,
} from "@/lib/nbaHistorySnapshot";
import { getMlbDisplayStars } from "@/lib/mlbFreePicks";
import { rankPublicFreePickRowsForHistory } from "@/lib/publicFreePicks";
import {
  getFreshPublicFreePickIds,
  getPublicFreePickHistory,
  type PublicFreePickHistorySnapshot,
} from "@/lib/publicFreePickHistory";
import { hasNbaTeamFreePickRiskCap } from "@/lib/nbaFreePickRisk";
import { getConfidenceLabel, getPickConfidenceStars } from "@/lib/starRatings";
import { americanToProfitPerUnit } from "@/lib/units";
import {
  getOrAnalyzeMlbPickGameReview,
  type MlbPickGameReview,
} from "@/lib/mlbGameReview";

const FREE_PICK_PAYOUT_FLOOR = 0.63;
const FIVE_STAR_FREE_PICK_PAYOUT_FLOOR = 0.5;
const FREE_PICK_STAKE_UNITS = 2;
const STANDARD_PICK_STAKE_UNITS = 1;
const PERFORMANCE_STAKING_NOTE =
  "Staking view: Free Picks count as 2u each; all other official picks count as 1u.";
const PERFORMANCE_PAGE_SIZE = 1000;
const PERFORMANCE_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "game_start_time",
  "status",
  "game_label",
  "side",
  "home_team",
  "away_team",
  "units_result",
  "odds_taken",
  "edge",
  "edge_label",
  "market_type",
  "confidence_score",
  "is_top_pick",
  "top_pick_rank",
  "notes",
  "line_taken",
  "projected_line",
  "projected_home_score",
  "projected_away_score",
  "final_score",
  "final_stat",
  "player_name",
  "created_at",
  "graded_at",
].join(",");

type PerformancePick = {
  id: number;
  pick_date: string;
  sport: string;
  market_scope?: string | null;
  game_start_time?: string | null;
  status: "pending" | "win" | "loss" | "push" | "postponed" | "voided";
  game_label: string;
  side: string;
  home_team?: string | null;
  away_team?: string | null;
  units_result?: number | null;
  odds_taken?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  market_type?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  line_taken?: number | null;
  projected_line?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  final_score?: string | null;
  final_stat?: number | null;
  player_name?: string | null;
};

type PerformanceQueryPick = PerformancePick & {
  created_at?: string | null;
  graded_at?: string | null;
};

function formatStartTime(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMonthDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${month}/${day}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)));
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

type PropAccuracyRow = BreakdownRow & {
  averageProjectionMiss: number;
  averageModelEdge: number;
};

type TopPickSummary = {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  netUnits: number;
  averageProjectionMiss: number;
};

type TopPickLossRow = {
  id: number;
  label: string;
  side: string;
  market: string;
  pickDate: string;
  missLabel: string;
  finalLabel: string;
  gameReviewLabel?: string | null;
  gameReviewSummary?: string | null;
  gameReviewSoftened?: boolean;
};

type AllHitParlayNight = {
  pickDate: string;
  shortDate: string;
  picks: number;
  pushes: number;
  boardPicks: number;
  parlayReturn: number;
  parlayProfit: number;
};

type AllHitParlaySummary = {
  completedDays: number;
  pendingDays: number;
  perfectDays: number;
  totalStake: number;
  totalReturn: number;
  netAfterDailyStakes: number;
  nights: AllHitParlayNight[];
};

type CalendarMonthDay = {
  key: string;
  date: string | null;
  dayNumber: number | null;
  units: number | null;
  pickCount: number;
  settledCount: number;
  pendingCount: number;
  hasSweep: boolean;
};

type CalendarMonthSummary = {
  monthKey: string;
  monthLabel: string;
  netUnits: number;
  settledPicks: number;
  pendingPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  winningDays: number;
  losingDays: number;
  pushDays: number;
  activeDays: number;
  bestDay: { label: string; value: number } | null;
  worstDay: { label: string; value: number } | null;
  parlaySummary: AllHitParlaySummary;
  calendarDays: CalendarMonthDay[];
};

type PerformanceSnapshotMap = Map<
  string,
  {
    mlb: MlbHistorySnapshot | null;
    nba: NbaHistorySnapshot | null;
    publicFreePicks: PublicFreePickHistorySnapshot | null;
  }
>;

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

function isOfficialHistoricalPerformancePick(row: PerformancePick, snapshotByDate: PerformanceSnapshotMap) {
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

function formatDateOnly(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`;
}

function formatEtDateFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return formatEtDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
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

function getRangeQueryStart(range: string) {
  if (range === "all") return null;

  const today = new Date();
  const start = new Date(today);

  if (range === "cm") {
    const currentMonthStart = `${getMonthKey(getCurrentCalendarDateEt())}-01`;
    return shiftDateKey(currentMonthStart, -1);
  }
  if (range === "4d" || range === "3d") start.setDate(today.getDate() - 4);
  if (range === "1w") start.setDate(today.getDate() - 7);
  if (range === "2w") start.setDate(today.getDate() - 14);
  if (range === "1m") start.setMonth(today.getMonth() - 1);
  if (range === "6m") start.setMonth(today.getMonth() - 6);
  if (range === "1y") start.setFullYear(today.getFullYear() - 1);
  if (range === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  }

  return formatDateOnly(start);
}

function getPerformanceDisplayDate(row: PerformanceQueryPick) {
  if (!row.game_start_time) return row.pick_date;

  const gameStart = new Date(row.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return row.pick_date;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(gameStart);

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

function getPerformanceCalendarDate(row: Pick<PerformanceQueryPick, "pick_date" | "game_start_time">) {
  return getEtCalendarDate(row.game_start_time) ?? row.pick_date ?? "";
}

function normalizePerformancePickDate(row: PerformanceQueryPick): PerformanceQueryPick {
  if (row.sport !== "MLB") return row;

  const displayDate = getPerformanceDisplayDate(row);
  if (!displayDate || displayDate === row.pick_date) return row;

  return {
    ...row,
    pick_date: displayDate,
  };
}

function getPerformanceDedupeDate(row: PerformanceQueryPick) {
  if (row.sport === "MLB") return getPerformanceDisplayDate(row) ?? row.pick_date ?? "";
  return row.pick_date ?? "";
}

function getPerformanceDedupeKey(row: PerformanceQueryPick) {
  return [
    getPerformanceDedupeDate(row),
    row.sport ?? "",
    row.market_scope ?? "",
    row.market_type ?? "",
    row.game_label ?? "",
    row.player_name ?? "",
    row.side ?? "",
    row.line_taken ?? "",
  ].join("::");
}

function getPerformanceTimeValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isSettledPerformancePick(row: PerformanceQueryPick) {
  return Boolean(row.status && row.status !== "pending");
}

function choosePreferredPerformancePick(existing: PerformanceQueryPick, next: PerformanceQueryPick) {
  const existingSettled = isSettledPerformancePick(existing);
  const nextSettled = isSettledPerformancePick(next);

  if (existingSettled !== nextSettled) {
    return nextSettled ? next : existing;
  }

  const existingTime = Math.max(
    getPerformanceTimeValue(existing.graded_at),
    getPerformanceTimeValue(existing.created_at)
  );
  const nextTime = Math.max(
    getPerformanceTimeValue(next.graded_at),
    getPerformanceTimeValue(next.created_at)
  );

  return nextTime >= existingTime ? next : existing;
}

function dedupePerformancePicks(rows: PerformanceQueryPick[]) {
  const deduped = new Map<string, PerformanceQueryPick>();

  for (const row of rows) {
    const key = getPerformanceDedupeKey(row);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    deduped.set(key, choosePreferredPerformancePick(existing, row));
  }

  return Array.from(deduped.values());
}

async function getPerformancePicks(params: {
  currentBettingDate: string;
  range: string;
  sport: string;
  scope: string;
}) {
  const supabase = getSupabaseServer();
  const rangeStart = getRangeQueryStart(params.range);
  const rows: PerformanceQueryPick[] = [];

  for (let from = 0; ; from += PERFORMANCE_PAGE_SIZE) {
    let query = supabase
      .from("picks")
      .select(PERFORMANCE_PICK_SELECT)
      .order("pick_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PERFORMANCE_PAGE_SIZE - 1);

    if (rangeStart) query = query.gte("pick_date", rangeStart);
    if (params.sport !== "all") query = query.eq("sport", params.sport);
    if (params.scope !== "all") query = query.eq("market_scope", params.scope);

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as unknown as PerformanceQueryPick[];
    rows.push(...page);

    if (page.length < PERFORMANCE_PAGE_SIZE) break;
  }

  return dedupePerformancePicks(rows.map(normalizePerformancePickDate)).filter(
    (pick) => pick.pick_date <= params.currentBettingDate
  ) as PerformancePick[];
}

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

function getCurrentCalendarDateEt() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  return formatEtDateFromParts(year, month, day);
}

function getMonthKey(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 7);
}

function isValidMonthKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function buildAvailableMonthKeys(
  rows: PerformancePick[],
  dateResolver: (row: PerformancePick) => string = (row) => row.pick_date
) {
  return Array.from(
    new Set(
      rows
        .map((row) => getMonthKey(dateResolver(row)))
        .filter((value) => value.length === 7)
    )
  ).sort((a, b) => b.localeCompare(a));
}

function filterByRange(rows: PerformancePick[], range: string) {
  if (range === "all") return rows;

  const today = new Date();
  const start = new Date(today);

  if (range === "cm") {
    const monthStart = `${getMonthKey(getCurrentCalendarDateEt())}-01`;
    return rows.filter((row) => getPerformanceCalendarDate(row) >= monthStart);
  }
  if (range === "4d" || range === "3d") start.setDate(today.getDate() - 4);
  if (range === "1w") start.setDate(today.getDate() - 7);
  if (range === "2w") start.setDate(today.getDate() - 14);
  if (range === "1m") start.setMonth(today.getMonth() - 1);
  if (range === "6m") start.setMonth(today.getMonth() - 6);
  if (range === "1y") start.setFullYear(today.getFullYear() - 1);
  if (range === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  }

  return rows.filter((row) => new Date(row.pick_date) >= start);
}

function filterBySport(rows: PerformancePick[], sport: string) {
  if (sport === "all") return rows;
  return rows.filter((row) => row.sport === sport);
}

function filterByScope(rows: PerformancePick[], scope: string) {
  if (scope === "all") return rows;
  return rows.filter((row) => row.market_scope === scope);
}

function getPerformanceProjectedMargin(pick: PerformancePick) {
  if (
    pick.projected_home_score === null ||
    pick.projected_home_score === undefined ||
    pick.projected_away_score === null ||
    pick.projected_away_score === undefined
  ) {
    return null;
  }

  return Number(pick.projected_home_score) - Number(pick.projected_away_score);
}

function getPerformanceProjectedSideMargin(pick: PerformancePick) {
  if (pick.projected_side_margin !== null && pick.projected_side_margin !== undefined) {
    return pick.projected_side_margin;
  }

  const projectedMargin = getPerformanceProjectedMargin(pick);
  if (projectedMargin === null) return null;

  if (pick.market_type === "moneyline" || pick.market_type === "spread") {
    const [labelAwayTeam, labelHomeTeam] = pick.game_label.split(" @ ");
    const awayTeam = pick.away_team ?? labelAwayTeam;
    const homeTeam = pick.home_team ?? labelHomeTeam;
    const normalizedSide = pick.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "").trim();

    if (homeTeam && normalizedSide === homeTeam) return projectedMargin;
    if (awayTeam && normalizedSide === awayTeam) return projectedMargin * -1;
  }

  return null;
}

function getPerformanceCoverBuffer(pick: PerformancePick) {
  if (pick.cover_buffer !== null && pick.cover_buffer !== undefined) {
    return pick.cover_buffer;
  }

  if (pick.market_type !== "spread" || pick.line_taken === null || pick.line_taken === undefined) {
    return null;
  }

  const projectedSideMargin = getPerformanceProjectedSideMargin(pick);
  if (projectedSideMargin === null) return null;

  return Number((projectedSideMargin + pick.line_taken).toFixed(2));
}

function getPerformanceDisplayStars(pick: PerformancePick, snapshotByDate?: PerformanceSnapshotMap) {
  const mlbSnapshot = pick.sport === "MLB" ? getMlbSnapshot(snapshotByDate, pick.pick_date) : null;
  const frozenStars =
    pick.sport === "MLB"
      ? getMlbHistorySnapshotStar(mlbSnapshot, pick.id)
      : pick.sport === "NBA"
        ? getNbaHistorySnapshotStar(getNbaSnapshot(snapshotByDate, pick.pick_date), pick.id)
        : null;

  if (pick.sport === "NBA") {
    if (frozenStars !== null) return frozenStars;

    const baseStars = getPickConfidenceStars(pick);
    return baseStars >= 5 && hasNbaTeamFreePickRiskCap(pick) ? 4 : baseStars;
  }
  if (pick.sport !== "MLB") return getPickConfidenceStars(pick);

  return getMlbDisplayStars({
    ...pick,
    sport: "MLB",
    projected_side_margin: getPerformanceProjectedSideMargin(pick),
    cover_buffer: getPerformanceCoverBuffer(pick),
  }, frozenStars, Boolean(mlbSnapshot?.freePickIds?.includes(pick.id)));
}

function getPayoutPerUnit(odds: number | null | undefined) {
  if (odds === null || odds === undefined) return 0;
  return americanToProfitPerUnit(odds);
}

function getFreePickPayoutFloor(stars: number) {
  return stars >= 5 ? FIVE_STAR_FREE_PICK_PAYOUT_FLOOR : FREE_PICK_PAYOUT_FLOOR;
}

function splitEdgeLabel(value: string | null | undefined) {
  const parts = (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    watch: parts
      .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
      .map((part) => part.replace(/^(Watch|Learning):\s*/, ""))
      .join(", "),
  };
}

function hasBlockingFreePickWatch(
  value: string | null | undefined,
  stars: number,
  marketScope?: string | null
) {
  const watchItems = (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
    .flatMap((part) =>
      part
        .replace(/^(Watch|Learning):\s*/, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );

  if (stars >= 5) {
    const blockingItems = watchItems.filter((item) => !item.toLowerCase().startsWith("low payout"));
    const hasOnlyLineupInjuryImpact =
      blockingItems.length === 1 && blockingItems[0].toLowerCase().includes("lineup has notable recent injury impact");

    return !(marketScope === "team" && hasOnlyLineupInjuryImpact) && blockingItems.length > 0;
  }

  return watchItems.length > 0;
}

function isTopOrValuePick(row: PerformancePick, snapshotByDate?: PerformanceSnapshotMap) {
  return isHistoricalTopPick(row, snapshotByDate) || isHistoricalBestValuePick(row, snapshotByDate);
}

function isTeamFreePickEligible(pick: PerformancePick) {
  const stars = getPerformanceDisplayStars(pick);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const projectedSideMargin = getPerformanceProjectedSideMargin(pick);
  const coverBuffer = getPerformanceCoverBuffer(pick);

  if (pick.sport !== "MLB") return false;
  if (pick.market_scope !== "team") return false;
  if (!isTopOrValuePick(pick)) return false;
  if (getPayoutPerUnit(pick.odds_taken) < getFreePickPayoutFloor(stars)) return false;
  if (stars < 4) return false;
  if (hasBlockingFreePickWatch(pick.edge_label, stars, pick.market_scope)) return false;

  if (pick.market_type === "moneyline") {
    return edge >= 4.5 && (projectedSideMargin ?? 0) >= 0.75;
  }

  if (pick.market_type === "spread") {
    return edge >= 0.6 && (coverBuffer ?? 0) >= 0.7;
  }

  if (pick.market_type === "total") {
    return edge >= 0.8;
  }

  return false;
}

function isPropFreePickEligible(pick: PerformancePick) {
  const stars = getPerformanceDisplayStars(pick);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const confidence = Number(pick.confidence_score ?? 0);

  if (pick.sport !== "MLB") return false;
  if (pick.market_scope !== "player_prop") return false;
  if (!isTopOrValuePick(pick)) return false;
  if (getPayoutPerUnit(pick.odds_taken) < getFreePickPayoutFloor(stars)) return false;
  if (stars < 4) return false;
  if (confidence < 68) return false;
  if (edge < 1.1) return false;
  if (hasBlockingFreePickWatch(pick.edge_label, stars, pick.market_scope)) return false;

  return true;
}

function getFreePickScore(pick: PerformancePick) {
  const payout = getPayoutPerUnit(pick.odds_taken);
  const stars = getPerformanceDisplayStars(pick);
  const confidence = Number(pick.confidence_score ?? stars * 20);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const projectedSideMargin = getPerformanceProjectedSideMargin(pick);
  const coverBuffer = getPerformanceCoverBuffer(pick);
  const projectedLine = Number(pick.projected_line ?? NaN);
  const marketLine = Number(pick.line_taken ?? NaN);
  const lineSupport =
    Number.isFinite(projectedLine) && Number.isFinite(marketLine)
      ? Math.abs(projectedLine - marketLine)
      : 0;

  let supportScore = edge * 8 + lineSupport * 10;

  if (pick.market_type === "spread") supportScore += Math.max(0, coverBuffer ?? 0) * 16;
  if (pick.market_type === "moneyline") supportScore += Math.max(0, projectedSideMargin ?? 0) * 22;
  if (pick.market_type === "total") supportScore += edge * 6;

  return Number(
    (
      confidence * 0.9 +
      stars * 16 +
      supportScore +
      Math.min(payout, 1.35) * 12 +
      (pick.is_top_pick ? 9 : 0) +
      (pick.notes === "best_value" ? 4 : 0)
    ).toFixed(2)
  );
}

function isFreePickEligible(pick: PerformancePick) {
  return isTeamFreePickEligible(pick) || isPropFreePickEligible(pick);
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

const BOARD_FILTER_VALUES = new Set(["free", "top", "value"]);
const STAR_FILTER_VALUES = new Set(["1", "2", "3", "4", "5"]);

function matchesBoardFilter(
  row: PerformancePick,
  boardFilter: string,
  freePickIds: Set<number>,
  snapshotByDate: PerformanceSnapshotMap
) {
  if (boardFilter === "free") return freePickIds.has(row.id);
  if (boardFilter === "top") return isHistoricalTopPick(row, snapshotByDate);
  if (boardFilter === "value") return isHistoricalBestValuePick(row, snapshotByDate);
  return true;
}

function filterByStars(
  rows: PerformancePick[],
  stars: string[],
  freePickIds: Set<number>,
  snapshotByDate: PerformanceSnapshotMap
) {
  if (stars.length === 0) return rows;

  const selectedBoardFilters = stars.filter((value) => BOARD_FILTER_VALUES.has(value));
  const selectedStarFilters = stars.filter((value) => STAR_FILTER_VALUES.has(value));

  return rows.filter((row) => {
    const matchesBoard =
      selectedBoardFilters.length === 0 ||
      selectedBoardFilters.some((boardFilter) =>
        matchesBoardFilter(row, boardFilter, freePickIds, snapshotByDate)
      );
    const matchesStars =
      selectedStarFilters.length === 0 ||
      selectedStarFilters.some(
        (starFilter) => getPerformanceDisplayStars(row, snapshotByDate) === Number(starFilter)
      );

    return matchesBoard && matchesStars;
  });
}

function getResolvedStatus(status: PerformancePick["status"]) {
  return status === "postponed" || status === "voided" ? "push" : status;
}

function getPerformanceStakeUnits(row: PerformancePick, freePickIds?: Set<number>) {
  return freePickIds?.has(row.id) ? FREE_PICK_STAKE_UNITS : STANDARD_PICK_STAKE_UNITS;
}

function getPerformanceUnits(row: PerformancePick, freePickIds?: Set<number>) {
  const status = getResolvedStatus(row.status);
  if (status === "pending" || status === "push") return 0;

  const stakeUnits = getPerformanceStakeUnits(row, freePickIds);
  if (status === "loss") return -stakeUnits;

  if (row.odds_taken !== null && row.odds_taken !== undefined) {
    return Number((americanToProfitPerUnit(row.odds_taken) * stakeUnits).toFixed(2));
  }

  return Number((Number(row.units_result ?? 0) * stakeUnits).toFixed(2));
}

function buildDailyNetMap(
  rows: PerformancePick[],
  dateResolver: (row: PerformancePick) => string = (row) => row.pick_date,
  freePickIds?: Set<number>
) {
  const dailyMap: Record<string, number> = {};

  for (const row of rows) {
    if (getResolvedStatus(row.status) === "pending") continue;

    const date = dateResolver(row);
    const units = getPerformanceUnits(row, freePickIds);
    dailyMap[date] = Number(((dailyMap[date] ?? 0) + units).toFixed(2));
  }

  return dailyMap;
}

function buildCumulativeSeries(
  rows: PerformancePick[],
  dateResolver: (row: PerformancePick) => string = (row) => row.pick_date,
  freePickIds?: Set<number>
) {
  const dailyMap = buildDailyNetMap(rows, dateResolver, freePickIds);
  const dates = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));

  let running = 0;

  return dates.map((date) => {
    running += dailyMap[date];
    running = Number(running.toFixed(2));

    return {
      label: date,
      value: running,
    };
  });
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
    entry.netUnits = Number((entry.netUnits + getPerformanceUnits(row, freePickIds)).toFixed(2));
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

function buildBreakdownByStars(
  rows: PerformancePick[],
  snapshotByDate: PerformanceSnapshotMap,
  freePickIds?: Set<number>
) {
  const starBuckets = [5, 4, 3, 2, 1, 0];
  const grouped = new Map<number, BreakdownRow>();

  for (const stars of starBuckets) {
    grouped.set(stars, {
      label: getConfidenceLabel(stars),
      picks: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      netUnits: 0,
    });
  }

  for (const row of rows) {
    const stars = getPerformanceDisplayStars(row, snapshotByDate);
    const entry = grouped.get(stars);
    if (!entry) continue;

    entry.picks += 1;
    entry.netUnits = Number((entry.netUnits + getPerformanceUnits(row, freePickIds)).toFixed(2));
    const resolvedStatus = getResolvedStatus(row.status);
    if (resolvedStatus === "win") entry.wins += 1;
    if (resolvedStatus === "loss") entry.losses += 1;
    if (resolvedStatus === "push") entry.pushes += 1;
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, entry]) => {
      const decisions = entry.wins + entry.losses;
      return {
        ...entry,
        winRate: decisions > 0 ? Number(((entry.wins / decisions) * 100).toFixed(1)) : 0,
      };
    })
    .filter((entry) => entry.picks > 0);
}

function formatPropMarketLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseTeamFinalScore(row: PerformancePick) {
  if (!row.final_score || row.projected_home_score === null || row.projected_home_score === undefined) {
    return null;
  }

  const [awayTeam, homeTeam] = row.game_label.split(" @ ");
  if (!awayTeam || !homeTeam) return null;

  const pattern = new RegExp(
    `${awayTeam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)\\s+-\\s+${homeTeam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)`
  );
  const match = row.final_score.match(pattern);
  if (!match) return null;

  return {
    awayScore: Number(match[1]),
    homeScore: Number(match[2]),
  };
}

function getProjectionMiss(row: PerformancePick) {
  if (row.market_scope === "player_prop") {
    if (
      row.projected_line === null ||
      row.projected_line === undefined ||
      row.final_stat === null ||
      row.final_stat === undefined
    ) {
      return null;
    }

    return Math.abs(Number(row.final_stat) - Number(row.projected_line));
  }

  if (
    row.projected_home_score === null ||
    row.projected_home_score === undefined ||
    row.projected_away_score === null ||
    row.projected_away_score === undefined
  ) {
    return null;
  }

  const parsedFinal = parseTeamFinalScore(row);
  if (!parsedFinal) return null;

  const projectedMargin = Number(row.projected_home_score) - Number(row.projected_away_score);
  const actualMargin = parsedFinal.homeScore - parsedFinal.awayScore;
  return Math.abs(actualMargin - projectedMargin);
}

function buildTopPickSummary(rows: PerformancePick[], freePickIds?: Set<number>): TopPickSummary {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let netUnits = 0;
  let missTotal = 0;
  let missSamples = 0;

  for (const row of rows) {
    const resolvedStatus = getResolvedStatus(row.status);
    if (resolvedStatus === "win") wins += 1;
    if (resolvedStatus === "loss") losses += 1;
    if (resolvedStatus === "push") pushes += 1;
    netUnits = Number((netUnits + getPerformanceUnits(row, freePickIds)).toFixed(2));

    const miss = getProjectionMiss(row);
    if (miss !== null) {
      missTotal += miss;
      missSamples += 1;
    }
  }

  const decisions = wins + losses;

  return {
    picks: rows.length,
    wins,
    losses,
    pushes,
    winRate: decisions > 0 ? Number(((wins / decisions) * 100).toFixed(1)) : 0,
    netUnits,
    averageProjectionMiss: missSamples > 0 ? Number((missTotal / missSamples).toFixed(2)) : 0,
  };
}

function calculatePerfectNightParlayReturn(rows: PerformancePick[], stakeUnits: number) {
  const winningRows = rows.filter((row) => getResolvedStatus(row.status) === "win");
  if (winningRows.length === 0) return null;

  let decimalMultiplier = 1;

  for (const row of winningRows) {
    if (row.odds_taken === null || row.odds_taken === undefined) return null;
    decimalMultiplier *= 1 + getPayoutPerUnit(row.odds_taken);
  }

  return Number((stakeUnits * decimalMultiplier).toFixed(2));
}

function buildAllHitParlaySummary(
  rows: PerformancePick[],
  stars: string[],
  scope: string,
  stakeUnits = 0.5,
  dateResolver: (row: PerformancePick) => string = (row) => row.pick_date
): AllHitParlaySummary {
  const grouped = new Map<string, PerformancePick[]>();

  for (const row of rows) {
    const dateKey = dateResolver(row);
    const existing = grouped.get(dateKey) ?? [];
    existing.push(row);
    grouped.set(dateKey, existing);
  }

  let completedDays = 0;
  let pendingDays = 0;
  const nights: AllHitParlayNight[] = [];

  for (const [pickDate, dayRows] of grouped.entries()) {
    const hasPending = dayRows.some((row) => getResolvedStatus(row.status) === "pending");
    if (hasPending) {
      pendingDays += 1;
      continue;
    }

    completedDays += 1;

    const wins = dayRows.filter((row) => getResolvedStatus(row.status) === "win").length;
    const losses = dayRows.filter((row) => getResolvedStatus(row.status) === "loss").length;
    const pushes = dayRows.filter((row) => getResolvedStatus(row.status) === "push").length;

    if (losses > 0 || wins === 0) continue;

    const parlayReturn = calculatePerfectNightParlayReturn(dayRows, stakeUnits);
    if (parlayReturn === null) continue;

    nights.push({
      pickDate,
      shortDate: formatMonthDay(pickDate),
      picks: wins,
      pushes,
      boardPicks: dayRows.length,
      parlayReturn,
      parlayProfit: Number((parlayReturn - stakeUnits).toFixed(2)),
    });
  }

  const sortedNights = [...nights].sort((a, b) => b.pickDate.localeCompare(a.pickDate));
  const totalStake = Number((completedDays * stakeUnits).toFixed(2));
  const totalReturn = Number(
    sortedNights.reduce((sum, night) => sum + night.parlayReturn, 0).toFixed(2)
  );

  return {
    completedDays,
    pendingDays,
    perfectDays: sortedNights.length,
    totalStake,
    totalReturn,
    netAfterDailyStakes: Number((totalReturn - totalStake).toFixed(2)),
    nights: sortedNights,
  };
}

function buildMonthCalendarDays(
  rows: PerformancePick[],
  monthKey: string,
  parlaySummary: AllHitParlaySummary,
  dateResolver: (row: PerformancePick) => string,
  freePickIds?: Set<number>
) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return [] as CalendarMonthDay[];

  const dayStats = new Map<
    string,
    {
      pickCount: number;
      settledCount: number;
      pendingCount: number;
      units: number;
    }
  >();

  for (const row of rows) {
    const dateKey = dateResolver(row);
    if (!dateKey.startsWith(monthKey)) continue;

    const existing = dayStats.get(dateKey) ?? {
      pickCount: 0,
      settledCount: 0,
      pendingCount: 0,
      units: 0,
    };

    existing.pickCount += 1;

    const resolvedStatus = getResolvedStatus(row.status);
    if (resolvedStatus === "pending") {
      existing.pendingCount += 1;
    } else {
      existing.settledCount += 1;
      existing.units = Number((existing.units + getPerformanceUnits(row, freePickIds)).toFixed(2));
    }

    dayStats.set(dateKey, existing);
  }

  const perfectDaySet = new Set(parlaySummary.nights.map((night) => night.pickDate));
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const calendarDays: CalendarMonthDay[] = [];

  for (let index = 0; index < startOffset; index += 1) {
    calendarDays.push({
      key: `blank-start-${index}`,
      date: null,
      dayNumber: null,
      units: null,
      pickCount: 0,
      settledCount: 0,
      pendingCount: 0,
      hasSweep: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const stats = dayStats.get(date);

    calendarDays.push({
      key: date,
      date,
      dayNumber: day,
      units: stats ? stats.units : null,
      pickCount: stats?.pickCount ?? 0,
      settledCount: stats?.settledCount ?? 0,
      pendingCount: stats?.pendingCount ?? 0,
      hasSweep: perfectDaySet.has(date),
    });
  }

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push({
      key: `blank-end-${calendarDays.length}`,
      date: null,
      dayNumber: null,
      units: null,
      pickCount: 0,
      settledCount: 0,
      pendingCount: 0,
      hasSweep: false,
    });
  }

  return calendarDays;
}

function buildCalendarMonthSummary(
  rows: PerformancePick[],
  monthKey: string,
  dateResolver: (row: PerformancePick) => string,
  freePickIds?: Set<number>
): CalendarMonthSummary {
  const monthRows = rows.filter((row) => dateResolver(row).startsWith(monthKey));
  const settledRows = monthRows.filter((row) => getResolvedStatus(row.status) !== "pending");
  const pendingRows = monthRows.filter((row) => getResolvedStatus(row.status) === "pending");
  const wins = settledRows.filter((row) => getResolvedStatus(row.status) === "win").length;
  const losses = settledRows.filter((row) => getResolvedStatus(row.status) === "loss").length;
  const pushes = settledRows.filter((row) => getResolvedStatus(row.status) === "push").length;
  const decisions = wins + losses;
  const dailyNetMap = buildDailyNetMap(monthRows, dateResolver, freePickIds);
  const dailyEntries = Object.keys(dailyNetMap)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      label: date,
      value: Number(dailyNetMap[date].toFixed(2)),
    }));
  const parlaySummary = buildAllHitParlaySummary(monthRows, [], "all", 0.5, dateResolver);
  const netUnits = dailyEntries.reduce((sum, day) => Number((sum + day.value).toFixed(2)), 0);
  const bestDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((best, current) => (current.value > best.value ? current : best))
      : null;
  const worstDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((worst, current) => (current.value < worst.value ? current : worst))
      : null;

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    netUnits,
    settledPicks: settledRows.length,
    pendingPicks: pendingRows.length,
    wins,
    losses,
    pushes,
    winRate: decisions > 0 ? Number(((wins / decisions) * 100).toFixed(1)) : 0,
    winningDays: dailyEntries.filter((day) => day.value > 0).length,
    losingDays: dailyEntries.filter((day) => day.value < 0).length,
    pushDays: dailyEntries.filter((day) => day.value === 0).length,
    activeDays: Array.from(new Set(monthRows.map((row) => dateResolver(row)))).length,
    bestDay,
    worstDay,
    parlaySummary,
    calendarDays: buildMonthCalendarDays(monthRows, monthKey, parlaySummary, dateResolver, freePickIds),
  };
}

async function buildMlbLossReviewMap(rows: PerformancePick[]) {
  const candidateById = new Map<number, PerformancePick>();

  for (const row of rows) {
    if (
      row.sport === "MLB" &&
      row.market_scope === "team" &&
      getResolvedStatus(row.status) === "loss"
    ) {
      candidateById.set(row.id, row);
    }
  }

  const entries = await Promise.all(
    [...candidateById.values()].map(async (row) => {
      try {
        const review = await getOrAnalyzeMlbPickGameReview({
          pickId: row.id,
          pickDate: row.pick_date,
          gameLabel: row.game_label,
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          gameStartTime: row.game_start_time,
          side: row.side,
          lineTaken: row.line_taken,
          marketType: row.market_type,
          resultStatus: row.status,
        });

        return [row.id, review] as const;
      } catch {
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is [number, MlbPickGameReview] => Boolean(entry)));
}

function getLossRowReviewFields(
  row: PerformancePick,
  reviewByPickId: Map<number, MlbPickGameReview>
) {
  const review = reviewByPickId.get(row.id);
  if (!review || review.verdict === "unknown") {
    return {
      gameReviewLabel: null,
      gameReviewSummary: null,
      gameReviewSoftened: false,
    };
  }

  return {
    gameReviewLabel: review.verdictLabel,
    gameReviewSummary:
      review.reasons.length > 0
        ? `${review.summary} ${review.reasons.join(" ")}`
        : review.summary,
    gameReviewSoftened: review.shouldSoftenLearning,
  };
}

function buildTopPickLossRows(
  rows: PerformancePick[],
  reviewByPickId: Map<number, MlbPickGameReview> = new Map()
) {
  return rows
    .filter((row) => getResolvedStatus(row.status) === "loss")
    .map((row): TopPickLossRow => {
      const reviewFields = getLossRowReviewFields(row, reviewByPickId);

      if (row.market_scope === "player_prop") {
        const miss =
          row.projected_line !== null &&
          row.projected_line !== undefined &&
          row.final_stat !== null &&
          row.final_stat !== undefined
            ? Math.abs(Number(row.final_stat) - Number(row.projected_line))
            : null;

        return {
          id: row.id,
          label: row.player_name ? `${row.player_name} | ${row.game_label}` : row.game_label,
          side: row.side,
          market: formatPropMarketLabel(row.market_type),
          pickDate: row.pick_date,
          missLabel:
            miss !== null
              ? `Missed projection by ${miss.toFixed(2)}`
              : "Projection miss unavailable",
          finalLabel:
            row.final_stat !== null && row.final_stat !== undefined
              ? `Projected ${row.projected_line ?? "N/A"} | Final ${row.final_stat}`
              : "Final stat unavailable",
          ...reviewFields,
        };
      }

      const parsedFinal = parseTeamFinalScore(row);
      const projectedAway = row.projected_away_score;
      const projectedHome = row.projected_home_score;
      const marginMiss = getProjectionMiss(row);

      return {
        id: row.id,
        label: row.game_label,
        side: row.side,
        market: row.market_type ?? "team",
        pickDate: row.pick_date,
        missLabel:
          marginMiss !== null
            ? `Margin miss ${marginMiss.toFixed(2)}`
            : "Projection miss unavailable",
        finalLabel:
          projectedAway !== null &&
          projectedAway !== undefined &&
          projectedHome !== null &&
          projectedHome !== undefined &&
          parsedFinal
            ? `Projected ${row.game_label.split(" @ ")[0]} ${projectedAway} - ${row.game_label.split(" @ ")[1]} ${projectedHome} | Final ${row.final_score}`
            : row.final_score ?? "Final score unavailable",
        ...reviewFields,
      };
    })
    .sort((a, b) => b.pickDate.localeCompare(a.pickDate))
    .slice(0, 12);
}

function buildPropAccuracyBreakdown(
  rows: PerformancePick[],
  getLabel: (row: PerformancePick) => string,
  freePickIds?: Set<number>
) {
  const grouped = new Map<string, PropAccuracyRow>();

  for (const row of rows) {
    const label = getLabel(row);
    if (!grouped.has(label)) {
      grouped.set(label, {
        label,
        picks: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        winRate: 0,
        netUnits: 0,
        averageProjectionMiss: 0,
        averageModelEdge: 0,
      });
    }

    const entry = grouped.get(label);
    if (!entry) continue;

    entry.picks += 1;
    entry.netUnits = Number((entry.netUnits + getPerformanceUnits(row, freePickIds)).toFixed(2));

    const resolvedStatus = getResolvedStatus(row.status);
    if (resolvedStatus === "win") entry.wins += 1;
    if (resolvedStatus === "loss") entry.losses += 1;
    if (resolvedStatus === "push") entry.pushes += 1;

    const projectionMiss =
      row.projected_line !== null &&
      row.projected_line !== undefined &&
      row.final_stat !== null &&
      row.final_stat !== undefined
        ? Math.abs(Number(row.final_stat) - Number(row.projected_line))
        : null;

    const modelEdge =
      row.projected_line !== null &&
      row.projected_line !== undefined &&
      row.line_taken !== null &&
      row.line_taken !== undefined
        ? Math.abs(Number(row.projected_line) - Number(row.line_taken))
        : null;

    if (projectionMiss !== null) {
      entry.averageProjectionMiss += projectionMiss;
    }

    if (modelEdge !== null) {
      entry.averageModelEdge += modelEdge;
    }
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const decisions = entry.wins + entry.losses;
      return {
        ...entry,
        winRate: decisions > 0 ? Number(((entry.wins / decisions) * 100).toFixed(1)) : 0,
        averageProjectionMiss: Number((entry.averageProjectionMiss / entry.picks).toFixed(2)),
        averageModelEdge: Number((entry.averageModelEdge / entry.picks).toFixed(2)),
      };
    })
    .sort((a, b) => b.netUnits - a.netUnits);
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; sport?: string; scope?: string; stars?: string; view?: string; month?: string }>;
}) {
  const params = await searchParams;

  const range =
    params.range === "3d"
      ? "4d"
      : params.range === "cm" ||
          params.range === "4d" ||
          params.range === "1w" ||
          params.range === "2w" ||
          params.range === "1m" ||
          params.range === "6m" ||
          params.range === "ytd" ||
          params.range === "1y" ||
          params.range === "all"
        ? params.range
        : "cm";

  const sport =
    params.sport === "NBA" || params.sport === "MLB" || params.sport === "SOCCER"
      ? params.sport
      : "all";
  const scope =
    params.scope === "team" || params.scope === "player_prop" ? params.scope : "all";
  const view = params.view === "calendar" ? "calendar" : "overview";
  const validStarValues = new Set(["free", "top", "value", "1", "2", "3", "4", "5"]);
  const stars =
    params.stars === "none"
      ? []
      : (params.stars ?? "free")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => validStarValues.has(value));

  const currentBettingDate = getCurrentBettingDateEt();
  const currentCalendarMonth = getMonthKey(getCurrentCalendarDateEt());
  const datedRows = await getPerformancePicks({
    currentBettingDate,
    range: view === "calendar" ? "all" : range,
    sport,
    scope,
  });
  const mlbDateSet = new Set(
    datedRows.filter((pick) => pick.sport === "MLB").map((pick) => pick.pick_date)
  );
  const nbaDateSet = new Set(
    datedRows.filter((pick) => pick.sport === "NBA").map((pick) => pick.pick_date)
  );
  const snapshotByDate: PerformanceSnapshotMap = new Map(
    await Promise.all(
      Array.from(new Set([...mlbDateSet, ...nbaDateSet])).map(async (pickDate) => {
        const [mlb, nba, publicFreePicks] = await Promise.all([
          mlbDateSet.has(pickDate) ? getMlbHistorySnapshot(pickDate) : Promise.resolve(null),
          nbaDateSet.has(pickDate) ? getNbaHistorySnapshot(pickDate) : Promise.resolve(null),
          getPublicFreePickHistory(pickDate),
        ]);

        return [
          pickDate,
          {
            mlb,
            nba,
            publicFreePicks,
          },
        ] as const;
      })
    )
  );
  const allPicks = datedRows.filter((pick) => isOfficialHistoricalPerformancePick(pick, snapshotByDate));
  const allFreePickRows = buildFreePickRows(allPicks, snapshotByDate);
  const allFreePickIds = new Set(allFreePickRows.map((pick) => pick.id));
  const allStarFiltered = filterByStars(allPicks, stars, allFreePickIds, snapshotByDate);
  const availableMonthKeys = buildAvailableMonthKeys(allPicks, getPerformanceCalendarDate);
  const selectedMonth =
    view === "calendar" && isValidMonthKey(params.month)
      ? params.month!
      : availableMonthKeys.includes(currentCalendarMonth)
        ? currentCalendarMonth
        : availableMonthKeys[0] ?? currentCalendarMonth;

  if (view === "calendar") {
    const selectedMonthSummary = buildCalendarMonthSummary(
      allStarFiltered,
      selectedMonth,
      getPerformanceCalendarDate,
      allFreePickIds
    );
    const currentMonthSummary =
      selectedMonth === currentCalendarMonth
        ? selectedMonthSummary
        : buildCalendarMonthSummary(
            allStarFiltered,
            currentCalendarMonth,
            getPerformanceCalendarDate,
            allFreePickIds
          );
    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <main className="mx-auto max-w-[88rem] px-6 py-8">
        <div className="app-card rounded-[2rem] p-8 mb-6">
          <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
            Performance review
          </div>
          <h1 className="text-4xl font-semibold text-slate-950 mb-2">Performance</h1>
          <p className="text-slate-600 max-w-3xl">
            Compare full months on one screen, keep the same sport and board filters, and see exactly which
            days were green, red, or sweep days. {PERFORMANCE_STAKING_NOTE}
          </p>
        </div>

        <PerformanceRangeSelect
          current={range}
          sport={sport}
          scope={scope}
          stars={stars}
          view={view}
          month={selectedMonth}
          monthOptions={availableMonthKeys}
        />

        <div className="grid gap-6 mb-6">
          <div className="app-panel rounded-3xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
              <div>
                <div className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-2">Selected Month</div>
                <h2 className="text-3xl font-semibold text-slate-950">{selectedMonthSummary.monthLabel}</h2>
              </div>
              <div
                className={
                  selectedMonthSummary.netUnits >= 0
                    ? "text-4xl font-semibold text-emerald-700"
                    : "text-4xl font-semibold text-rose-700"
                }
              >
                {selectedMonthSummary.netUnits.toFixed(2)}u
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 mb-5">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Settled Picks</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{selectedMonthSummary.settledPicks}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedMonthSummary.wins}-{selectedMonthSummary.losses}-{selectedMonthSummary.pushes} W-L-P
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Win Rate (W/L only)</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{selectedMonthSummary.winRate}%</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Winning Days</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{selectedMonthSummary.winningDays}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Sweep Days</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">
                  {selectedMonthSummary.parlaySummary.perfectDays}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedMonthSummary.parlaySummary.completedDays} completed days
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Parlay Net</div>
                <div
                  className={
                    selectedMonthSummary.parlaySummary.netAfterDailyStakes >= 0
                      ? "mt-2 text-3xl font-semibold text-emerald-700"
                      : "mt-2 text-3xl font-semibold text-rose-700"
                  }
                >
                  {selectedMonthSummary.parlaySummary.netAfterDailyStakes.toFixed(2)}u
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedMonthSummary.parlaySummary.totalReturn.toFixed(2)}u returned
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Best / Worst Day</div>
                <div className="mt-2 text-sm text-slate-700">
                  {selectedMonthSummary.bestDay
                    ? `${selectedMonthSummary.bestDay.label}: ${selectedMonthSummary.bestDay.value.toFixed(2)}u`
                    : "No graded days yet"}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {selectedMonthSummary.worstDay
                    ? `${selectedMonthSummary.worstDay.label}: ${selectedMonthSummary.worstDay.value.toFixed(2)}u`
                    : ""}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-2">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200/70 bg-white/55 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {selectedMonthSummary.calendarDays.map((day) => {
                const hasData = day.date !== null && day.pickCount > 0;
                const hasOnlyPending = hasData && day.settledCount === 0 && day.pendingCount > 0;
                const toneClass =
                  day.date === null
                    ? "border-transparent bg-transparent"
                    : hasOnlyPending
                    ? "border-sky-200 bg-sky-50/70"
                    : day.units === null
                    ? "border-slate-200/70 bg-white/45"
                    : day.units > 0
                    ? "border-emerald-200 bg-emerald-50/85"
                    : day.units < 0
                    ? "border-rose-200 bg-rose-50/85"
                    : "border-amber-200 bg-amber-50/80";

                return (
                  <div
                    key={day.key}
                    className={`min-h-[7.5rem] rounded-[1.4rem] border px-3 py-3 ${toneClass}`}
                  >
                    {day.date ? (
                      <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-950">{day.dayNumber}</div>
                          {day.hasSweep ? (
                            <div className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                              Sweep
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3">
                          {hasOnlyPending ? (
                            <div className="text-sm font-semibold text-sky-700">Pending</div>
                          ) : day.units !== null ? (
                            <div
                              className={
                                day.units > 0
                                  ? "text-base font-semibold text-emerald-700"
                                  : day.units < 0
                                  ? "text-base font-semibold text-rose-700"
                                  : "text-base font-semibold text-amber-700"
                              }
                            >
                              {day.units.toFixed(2)}u
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400">No picks</div>
                          )}
                        </div>

                        <div className="mt-auto pt-4 text-xs text-slate-500">
                          {day.pickCount > 0 ? (
                            <>
                              {day.pickCount} pick{day.pickCount === 1 ? "" : "s"}
                              {day.pendingCount > 0 ? ` | ${day.pendingCount} pending` : ""}
                            </>
                          ) : (
                            " "
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedMonth !== currentCalendarMonth ? (
            <div className="app-panel rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div>
                  <div className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-2">Current Month</div>
                  <h2 className="text-3xl font-semibold text-slate-950">{currentMonthSummary.monthLabel}</h2>
                </div>
                <div
                  className={
                    currentMonthSummary.netUnits >= 0
                      ? "text-4xl font-semibold text-emerald-700"
                      : "text-4xl font-semibold text-rose-700"
                  }
                >
                  {currentMonthSummary.netUnits.toFixed(2)}u
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Settled Picks</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-950">{currentMonthSummary.settledPicks}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {currentMonthSummary.wins}-{currentMonthSummary.losses}-{currentMonthSummary.pushes} W-L-P
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Win Rate (W/L only)</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-950">{currentMonthSummary.winRate}%</div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Sweep Days</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-950">
                    {currentMonthSummary.parlaySummary.perfectDays}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Parlay Net</div>
                  <div
                    className={
                      currentMonthSummary.parlaySummary.netAfterDailyStakes >= 0
                        ? "mt-2 text-3xl font-semibold text-emerald-700"
                        : "mt-2 text-3xl font-semibold text-rose-700"
                    }
                  >
                    {currentMonthSummary.parlaySummary.netAfterDailyStakes.toFixed(2)}u
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Winning / Losing Days</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {currentMonthSummary.winningDays} green days
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {currentMonthSummary.losingDays} red days
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                  <div className="text-sm text-slate-500">Best / Worst Day</div>
                  <div className="mt-2 text-sm text-slate-700">
                    {currentMonthSummary.bestDay
                      ? `${currentMonthSummary.bestDay.label}: ${currentMonthSummary.bestDay.value.toFixed(2)}u`
                      : "No graded days yet"}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {currentMonthSummary.worstDay
                      ? `${currentMonthSummary.worstDay.label}: ${currentMonthSummary.worstDay.value.toFixed(2)}u`
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  const baseFiltered = filterByRange(allPicks, range);
  const aggregateDateResolver =
    range === "cm"
      ? (row: PerformancePick) => getPerformanceCalendarDate(row)
      : (row: PerformancePick) => row.pick_date;
  const freePickRows = buildFreePickRows(baseFiltered, snapshotByDate);
  const freePickIds = new Set(freePickRows.map((pick) => pick.id));
  const filtered = filterByStars(baseFiltered, stars, freePickIds, snapshotByDate);

  const settled = filtered.filter((pick) => getResolvedStatus(pick.status) !== "pending");
  const pending = filtered.filter((pick) => getResolvedStatus(pick.status) === "pending");
  const settledFreePicks = freePickRows.filter((pick) => getResolvedStatus(pick.status) !== "pending");
  const pendingFreePicks = freePickRows.filter((pick) => getResolvedStatus(pick.status) === "pending");
  const freePickSummary = buildTopPickSummary(settledFreePicks, freePickIds);
  const freePickMarketBreakdown = buildBreakdownByMarket(settledFreePicks, freePickIds);
  const allHitParlaySummary = buildAllHitParlaySummary(filtered, stars, scope, 0.5, aggregateDateResolver);
  const cumulativeSeries = buildCumulativeSeries(filtered, aggregateDateResolver, freePickIds);
  const dailyNetMap = buildDailyNetMap(filtered, aggregateDateResolver, freePickIds);
  const marketBreakdown = buildBreakdownByMarket(settled, freePickIds);
  const starBreakdown = buildBreakdownByStars(settled, snapshotByDate, freePickIds);
  const settledProps = settled.filter((pick) => pick.market_scope === "player_prop");
  const propMarketBreakdown = buildPropAccuracyBreakdown(
    settledProps,
    (row) => formatPropMarketLabel(row.market_type),
    freePickIds
  );
  const propBoardBreakdown = buildPropAccuracyBreakdown(settledProps, (row) => {
    if (isHistoricalTopPick(row, snapshotByDate)) return "Top Picks";
    if (isHistoricalBestValuePick(row, snapshotByDate)) return "Best Value";
    return "Other Props";
  }, freePickIds);
  const settledTopPicks = settled.filter((pick) => isHistoricalTopPick(pick, snapshotByDate));
  const topPickSummary = buildTopPickSummary(settledTopPicks, freePickIds);
  const topPickMarketBreakdown = buildBreakdownByMarket(settledTopPicks, freePickIds);
  const settledBestValuePicks = settled.filter((pick) => isHistoricalBestValuePick(pick, snapshotByDate));
  const bestValueSummary = buildTopPickSummary(settledBestValuePicks, freePickIds);
  const bestValueMarketBreakdown = buildBreakdownByMarket(settledBestValuePicks, freePickIds);
  const mlbLossReviewByPickId = await buildMlbLossReviewMap([
    ...settledFreePicks,
    ...settledTopPicks,
    ...settledBestValuePicks,
  ]);
  const freePickLossRows = buildTopPickLossRows(settledFreePicks, mlbLossReviewByPickId);
  const topPickLossRows = buildTopPickLossRows(settledTopPicks, mlbLossReviewByPickId);
  const bestValueLossRows = buildTopPickLossRows(settledBestValuePicks, mlbLossReviewByPickId);

  const dailyEntries = Object.keys(dailyNetMap)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      label: date,
      value: Number(dailyNetMap[date].toFixed(2)),
    }));
  const visibleDailyEntries = dailyEntries.slice(0, 5);
  const remainingDailyEntries = dailyEntries.slice(5);

  const netUnits =
    cumulativeSeries.length > 0 ? cumulativeSeries[cumulativeSeries.length - 1].value : 0;

  const settledWins = settled.filter((pick) => getResolvedStatus(pick.status) === "win").length;
  const settledLosses = settled.filter((pick) => getResolvedStatus(pick.status) === "loss").length;
  const settledPushes = settled.filter((pick) => getResolvedStatus(pick.status) === "push").length;
  const settledDecisions = settledWins + settledLosses;
  const settledWinRate =
    settledDecisions > 0 ? Number(((settledWins / settledDecisions) * 100).toFixed(1)) : 0;

  const winningDays = dailyEntries.filter((day) => day.value > 0).length;
  const losingDays = dailyEntries.filter((day) => day.value < 0).length;
  const pushDays = dailyEntries.filter((day) => day.value === 0).length;

  const bestDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((best, current) => (current.value > best.value ? current : best))
      : null;

  const worstDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((worst, current) => (current.value < worst.value ? current : worst))
      : null;

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          Performance review
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Performance</h1>
        <p className="text-slate-600 max-w-2xl">
          See what is actually working, compare star buckets, and review which markets are carrying the model. {PERFORMANCE_STAKING_NOTE}
        </p>
      </div>

      <PerformanceRangeSelect
        current={range}
        sport={sport}
        scope={scope}
        stars={stars}
        view={view}
        month={selectedMonth}
        monthOptions={availableMonthKeys}
      />

      <div className="app-panel performance-net-panel rounded-3xl p-6 mb-6">
        <div className="performance-net-label text-sm uppercase tracking-[0.18em] text-slate-500 mb-2">Current Net Units</div>
        <div
          className={
            netUnits >= 0
              ? "performance-net-value text-5xl font-semibold text-emerald-700"
              : "performance-net-value text-5xl font-semibold text-rose-700"
          }
        >
          {netUnits.toFixed(2)}u
        </div>
        <div className="mt-2 text-sm text-slate-600">{PERFORMANCE_STAKING_NOTE}</div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="app-stat rounded-3xl p-5">
          <strong>Settled Picks</strong>
          <div className="text-3xl mt-3 text-slate-950">{settled.length}</div>
          <div className="mt-2 text-sm text-slate-600">
            {settledWins}-{settledLosses}-{settledPushes} W-L-P
          </div>
          <div className="text-sm text-slate-600">{settledWinRate}% win rate (W/L only)</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Pending Picks</strong>
          <div className="text-3xl mt-3 text-slate-950">{pending.length}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Winning Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{winningDays}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Losing Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{losingDays}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="app-stat rounded-3xl p-5">
          <strong>Push Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{pushDays}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Best Day</strong>
          <div className="mt-3 text-slate-700">
            {bestDay ? `${bestDay.label} (${bestDay.value.toFixed(2)}u)` : "N/A"}
          </div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Worst Day</strong>
          <div className="mt-3 text-slate-700">
            {worstDay ? `${worstDay.label} (${worstDay.value.toFixed(2)}u)` : "N/A"}
          </div>
        </div>
      </div>

      <h2 className="app-section-title mb-3">Cumulative Units</h2>

      {cumulativeSeries.length === 0 ? (
        <div className="app-panel rounded-3xl p-5 mb-6">
          <p className="font-semibold mb-2">No graded results in this range yet.</p>
          <p className="text-sm text-slate-600">
            This usually means your saved picks are still pending, or no finished picks fall inside the selected range.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <PerformanceChart points={cumulativeSeries} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="app-panel rounded-3xl p-5">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Daily Net Units</h3>

          {dailyEntries.length === 0 ? (
            <p>No graded daily results yet.</p>
          ) : (
            <div className="space-y-2">
              {visibleDailyEntries.map((day) => (
                <div
                  key={day.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3"
                >
                  <span className="text-slate-700">{day.label}</span>
                  <span
                    className={
                      day.value > 0
                        ? "text-green-700 font-semibold"
                        : day.value < 0
                        ? "text-red-700 font-semibold"
                        : "text-yellow-700 font-semibold"
                    }
                  >
                    {day.value.toFixed(2)}u
                  </span>
                </div>
              ))}
              {remainingDailyEntries.length > 0 ? (
                <details className="group">
                  <summary className="list-none cursor-pointer rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white">
                    <div className="flex items-center justify-between">
                      <span>Show more</span>
                      <span className="text-slate-400 group-open:hidden">{remainingDailyEntries.length} more</span>
                      <span className="hidden text-slate-400 group-open:inline">Expanded</span>
                    </div>
                  </summary>
                  <div className="mt-2 space-y-2">
                    {remainingDailyEntries.map((day) => (
                      <div
                        key={day.label}
                        className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3"
                      >
                        <span className="text-slate-700">{day.label}</span>
                        <span
                          className={
                            day.value > 0
                              ? "text-green-700 font-semibold"
                              : day.value < 0
                              ? "text-red-700 font-semibold"
                              : "text-yellow-700 font-semibold"
                          }
                        >
                          {day.value.toFixed(2)}u
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </div>

        <FoldPanel title="Parlay Tracker">
          <p className="text-sm text-slate-600 mb-4">
            Counts the days in this exact filter where the full selected board had no losses.
            It uses the actual board size for that day, so a selective 5-pick board can still count as a sweep at 5-0.
            Pushes drop out of the parlay too, so a board can still cash at 5-0 with 1 push.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
              <div className="text-sm text-slate-500">Full-Board Cash Dates</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">
                {allHitParlaySummary.perfectDays}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
              <div className="text-sm text-slate-500">Completed Days</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">
                {allHitParlaySummary.completedDays}
              </div>
              {allHitParlaySummary.pendingDays > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  {allHitParlaySummary.pendingDays} day{allHitParlaySummary.pendingDays === 1 ? "" : "s"} still pending
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
              <div className="text-sm text-slate-500">0.5u Parlay Return</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-700">
                {allHitParlaySummary.totalReturn.toFixed(2)}u
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
              <div className="text-sm text-slate-500">Net After Daily 0.5u Stakes</div>
              <div
                className={
                  allHitParlaySummary.netAfterDailyStakes >= 0
                    ? "mt-2 text-3xl font-semibold text-emerald-700"
                    : "mt-2 text-3xl font-semibold text-rose-700"
                }
              >
                {allHitParlaySummary.netAfterDailyStakes.toFixed(2)}u
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {allHitParlaySummary.completedDays} x 0.5u = {allHitParlaySummary.totalStake.toFixed(2)}u staked
              </div>
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-lg font-semibold text-slate-950 mb-3">Dates That Cashed</h4>
            {allHitParlaySummary.nights.length === 0 ? (
              <p className="text-slate-600">No full-board cash dates in this filter yet.</p>
            ) : (
              <div className="space-y-2">
                {allHitParlaySummary.nights.map((night) => (
                  <div
                    key={night.pickDate}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-950">{night.shortDate}</div>
                        <div className="text-sm text-slate-600">
                          {night.picks}-0
                          {night.pushes > 0 ? ` with ${night.pushes} push${night.pushes === 1 ? "" : "es"}` : ""}
                          {" "}on a {night.boardPicks}-pick board
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-700">+{night.parlayProfit.toFixed(2)}u</div>
                        <div className="text-sm text-slate-500">0.5u to {night.parlayReturn.toFixed(2)}u</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FoldPanel>
      </div>

      <div className="grid gap-6 mt-6 lg:grid-cols-2">
        <div className="app-panel rounded-3xl p-5">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Performance By Market</h3>

          {marketBreakdown.length === 0 ? (
            <p>No settled picks to analyze by market yet.</p>
          ) : (
            <div className="space-y-2">
              {marketBreakdown.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-sm text-slate-600">
                      {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win
                      rate
                    </div>
                  </div>
                  <div
                    className={
                      row.netUnits >= 0
                        ? "font-semibold text-green-700"
                        : "font-semibold text-red-700"
                    }
                  >
                    {row.netUnits.toFixed(2)}u
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-panel rounded-3xl p-5">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Performance By Star Rating</h3>

          {starBreakdown.length === 0 ? (
            <p>No settled picks to analyze by rating yet.</p>
          ) : (
            <div className="space-y-2">
              {starBreakdown.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-sm text-slate-600">
                      {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win
                      rate
                    </div>
                  </div>
                  <div
                    className={
                      row.netUnits >= 0
                        ? "font-semibold text-green-700"
                        : "font-semibold text-red-700"
                    }
                  >
                    {row.netUnits.toFixed(2)}u
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FoldPanel
        title="Top Picks Review"
        summary="Settled Top Pick results by market with loss-quality notes for learning."
        badge={
          <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
            {settledTopPicks.length} settled
          </div>
        }
        className="mt-6"
      >
        {settledTopPicks.length === 0 ? (
          <p>No settled top picks to review yet.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Settled Top Picks</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{topPickSummary.picks}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {topPickSummary.wins}-{topPickSummary.losses}-{topPickSummary.pushes} W-L-P
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Win Rate (W/L only)</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{topPickSummary.winRate}%</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Net Units</div>
                <div className={topPickSummary.netUnits >= 0 ? "mt-2 text-3xl font-semibold text-emerald-700" : "mt-2 text-3xl font-semibold text-rose-700"}>
                  {topPickSummary.netUnits.toFixed(2)}u
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Avg Projection Miss</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{topPickSummary.averageProjectionMiss.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Top Picks By Market</h4>
                <div className="space-y-2">
                  {topPickMarketBreakdown.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-sm text-slate-600">
                          {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win rate
                        </div>
                      </div>
                      <div
                        className={
                          row.netUnits >= 0
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {row.netUnits.toFixed(2)}u
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Top Pick Loss Review</h4>
                {topPickLossRows.length === 0 ? (
                  <p className="text-slate-600">No top-pick losses in this range.</p>
                ) : (
                  <div className="space-y-2">
                    {topPickLossRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-4">
                        <div className="font-medium text-slate-950">{row.label}</div>
                        <div className="mt-1 text-sm text-slate-700">
                          {row.pickDate} | {row.market} | {row.side}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{row.finalLabel}</div>
                        <div className="text-sm text-rose-700 font-medium">{row.missLabel}</div>
                        {row.gameReviewLabel && row.gameReviewSummary ? (
                          <div
                            className={
                              row.gameReviewSoftened
                                ? "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                                : "mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2"
                            }
                          >
                            <div
                              className={
                                row.gameReviewSoftened
                                  ? "text-xs font-semibold uppercase text-emerald-700"
                                  : "text-xs font-semibold uppercase text-slate-600"
                              }
                            >
                              {row.gameReviewLabel}
                            </div>
                            <div className="mt-1 text-sm text-slate-700">{row.gameReviewSummary}</div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </FoldPanel>

      <FoldPanel
        title="Best Value Review"
        summary="Settled Best Value results by market with the same loss-quality notes used by the learning review."
        badge={
          <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
            {settledBestValuePicks.length} settled
          </div>
        }
        className="mt-6"
      >
        {settledBestValuePicks.length === 0 ? (
          <p>No settled Best Value picks to review yet.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Settled Best Value</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{bestValueSummary.picks}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {bestValueSummary.wins}-{bestValueSummary.losses}-{bestValueSummary.pushes} W-L-P
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Win Rate (W/L only)</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{bestValueSummary.winRate}%</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Net Units</div>
                <div className={bestValueSummary.netUnits >= 0 ? "mt-2 text-3xl font-semibold text-emerald-700" : "mt-2 text-3xl font-semibold text-rose-700"}>
                  {bestValueSummary.netUnits.toFixed(2)}u
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Avg Projection Miss</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{bestValueSummary.averageProjectionMiss.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Best Value By Market</h4>
                {bestValueMarketBreakdown.length === 0 ? (
                  <p className="text-slate-600">No settled Best Value picks by market yet.</p>
                ) : (
                  <div className="space-y-2">
                    {bestValueMarketBreakdown.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="font-medium">{row.label}</div>
                          <div className="text-sm text-slate-600">
                            {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win rate
                          </div>
                        </div>
                        <div
                          className={
                            row.netUnits >= 0
                              ? "font-semibold text-green-700"
                              : "font-semibold text-red-700"
                          }
                        >
                          {row.netUnits.toFixed(2)}u
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Best Value Loss Review</h4>
                {bestValueLossRows.length === 0 ? (
                  <p className="text-slate-600">No Best Value losses in this range.</p>
                ) : (
                  <div className="space-y-2">
                    {bestValueLossRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-4">
                        <div className="font-medium text-slate-950">{row.label}</div>
                        <div className="mt-1 text-sm text-slate-700">
                          {row.pickDate} | {row.market} | {row.side}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{row.finalLabel}</div>
                        <div className="text-sm text-rose-700 font-medium">{row.missLabel}</div>
                        {row.gameReviewLabel && row.gameReviewSummary ? (
                          <div
                            className={
                              row.gameReviewSoftened
                                ? "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                                : "mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2"
                            }
                          >
                            <div
                              className={
                                row.gameReviewSoftened
                                  ? "text-xs font-semibold uppercase text-emerald-700"
                                  : "text-xs font-semibold uppercase text-slate-600"
                              }
                            >
                              {row.gameReviewLabel}
                            </div>
                            <div className="mt-1 text-sm text-slate-700">{row.gameReviewSummary}</div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </FoldPanel>

      <FoldPanel
        title="Free Picks Review"
        summary="Reconstructed public Free Picks using the board rules, shown at 2u each."
        badge={
          <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
            {freePickRows.length} qualified
          </div>
        }
        className="mt-6"
      >
        <p className="text-sm text-slate-600 mb-4">
          Tracks the reconstructed top 3 Free Picks per betting day using the same MLB/NBA public-pick rules as the board. Free Pick units are shown at 2u each.
        </p>

        {freePickRows.length === 0 ? (
          <p>No Free Picks qualified in this range yet.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Settled Free Picks</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{freePickSummary.picks}</div>
                <div className="mt-2 text-sm text-slate-600">
                  {freePickSummary.wins}-{freePickSummary.losses}-{freePickSummary.pushes} W-L-P
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Pending Free Picks</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{pendingFreePicks.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Win Rate (W/L only)</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{freePickSummary.winRate}%</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Net Units at 2u Each</div>
                <div className={freePickSummary.netUnits >= 0 ? "mt-2 text-3xl font-semibold text-emerald-700" : "mt-2 text-3xl font-semibold text-rose-700"}>
                  {freePickSummary.netUnits.toFixed(2)}u
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4">
                <div className="text-sm text-slate-500">Avg Projection Miss</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{freePickSummary.averageProjectionMiss.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Free Picks By Market</h4>
                {freePickMarketBreakdown.length === 0 ? (
                  <p className="text-slate-600">No settled Free Picks by market yet.</p>
                ) : (
                  <div className="space-y-2">
                    {freePickMarketBreakdown.map((row) => (
                      <div
                        key={row.label}
                        className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="font-medium">{row.label}</div>
                          <div className="text-sm text-slate-600">
                            {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win rate
                          </div>
                        </div>
                        <div
                          className={
                            row.netUnits >= 0
                              ? "font-semibold text-green-700"
                              : "font-semibold text-red-700"
                          }
                        >
                          {row.netUnits.toFixed(2)}u
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-lg font-semibold text-slate-950 mb-3">Free Pick Loss Review</h4>
                {freePickLossRows.length === 0 ? (
                  <p className="text-slate-600">No Free Pick losses in this range.</p>
                ) : (
                  <div className="space-y-2">
                    {freePickLossRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-4">
                        <div className="font-medium text-slate-950">{row.label}</div>
                        <div className="mt-1 text-sm text-slate-700">
                          {row.pickDate} | {row.market} | {row.side}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{row.finalLabel}</div>
                        <div className="text-sm text-rose-700 font-medium">{row.missLabel}</div>
                        {row.gameReviewLabel && row.gameReviewSummary ? (
                          <div
                            className={
                              row.gameReviewSoftened
                                ? "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                                : "mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2"
                            }
                          >
                            <div
                              className={
                                row.gameReviewSoftened
                                  ? "text-xs font-semibold uppercase text-emerald-700"
                                  : "text-xs font-semibold uppercase text-slate-600"
                              }
                            >
                              {row.gameReviewLabel}
                            </div>
                            <div className="mt-1 text-sm text-slate-700">{row.gameReviewSummary}</div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </FoldPanel>

      {scope === "player_prop" && (
        <div className="grid gap-6 mt-6 lg:grid-cols-2">
          <div className="app-panel rounded-3xl p-5">
            <h3 className="text-xl font-semibold text-slate-950 mb-3">Prop Performance By Type</h3>

            {propMarketBreakdown.length === 0 ? (
              <p>No settled player props to review yet.</p>
            ) : (
              <div className="space-y-2">
                {propMarketBreakdown.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-sm text-slate-600">
                          {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win rate
                        </div>
                      </div>
                      <div
                        className={
                          row.netUnits >= 0
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {row.netUnits.toFixed(2)}u
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      Avg miss vs final stat: {row.averageProjectionMiss.toFixed(2)} | Avg model edge vs line:{" "}
                      {row.averageModelEdge.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="app-panel rounded-3xl p-5">
            <h3 className="text-xl font-semibold text-slate-950 mb-3">Prop Performance By Board</h3>

            {propBoardBreakdown.length === 0 ? (
              <p>No settled player props to compare yet.</p>
            ) : (
              <div className="space-y-2">
                {propBoardBreakdown.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-sm text-slate-600">
                          {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win rate
                        </div>
                      </div>
                      <div
                        className={
                          row.netUnits >= 0
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {row.netUnits.toFixed(2)}u
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      Avg miss vs final stat: {row.averageProjectionMiss.toFixed(2)} | Avg model edge vs line:{" "}
                      {row.averageModelEdge.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="app-panel rounded-3xl p-5 mt-6">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Pending Picks In This Range</h3>
          <div className="space-y-2">
            {pending.map((pick) => (
              <div key={pick.id} className="rounded-2xl border border-slate-200/80 bg-white/72 px-4 py-3">
                <div className="font-medium text-slate-950">{pick.game_label}</div>
                <div className="text-sm text-slate-600">
                  {pick.pick_date} | {formatStartTime(pick.game_start_time)} ET | {pick.sport} | {pick.side} | {getConfidenceLabel(getPerformanceDisplayStars(pick, snapshotByDate))} | {pick.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
