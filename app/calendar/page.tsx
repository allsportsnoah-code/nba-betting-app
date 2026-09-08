import Link from "next/link";
import CalendarFilterSelect from "@/app/components/CalendarFilterSelect";
import {
  FREE_PICK_PAYOUT_FLOOR,
  getFreePickPayoutFloor,
  getMlbDisplayStars,
} from "@/lib/mlbFreePicks";
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
import {
  getMlbPitcherPropDetails,
  type MlbPitcherPropDetails,
} from "@/lib/mlbPitcherPropDetails";
import { rankPublicFreePickRowsForHistory } from "@/lib/publicFreePicks";
import {
  getFreshPublicFreePickIds,
  getPublicFreePickHistory,
  type PublicFreePickHistorySnapshot,
} from "@/lib/publicFreePickHistory";
import { hasNbaTeamFreePickRiskCap } from "@/lib/nbaFreePickRisk";
import { filterOfficialHistoricalPicks } from "@/lib/pickVisibility";
import { getPickStatusLabel, isPendingPickStatus, resolvePickStatus } from "@/lib/pickStatus";
import { getConfidenceLabel, getPickConfidenceStars } from "@/lib/starRatings";
import { getServerRequestOrigin } from "@/lib/requestOrigin";
import { americanToProfitPerUnit } from "@/lib/units";

const FREE_PICK_STAKE_UNITS = 2;
const STANDARD_PICK_STAKE_UNITS = 1;
const FREE_PICK_STAKING_NOTE =
  "Staking note: Free Picks are tracked as 2u plays; every other pick is tracked as 1u.";

type CalendarPick = {
  id: number;
  created_at?: string | null;
  pick_date: string;
  sport: string;
  market_scope?: string | null;
  player_name?: string | null;
  side: string;
  status: string;
  game_label: string;
  line_taken?: number | null;
  home_team?: string | null;
  away_team?: string | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  final_score?: string | null;
  final_stat?: number | null;
  edge_label?: string | null;
  edge?: number | null;
  top_pick_rank?: number | null;
  units_result?: number | null;
  is_top_pick?: boolean | null;
  market_type?: string | null;
  confidence_score?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  odds_taken?: number | null;
  locked_at?: string | null;
  game_start_time?: string | null;
  notes?: string | null;
};

type CalendarSnapshotSet = {
  mlb: MlbHistorySnapshot | null;
  nba: NbaHistorySnapshot | null;
  publicFreePicks: PublicFreePickHistorySnapshot | null;
};

async function getAllPicks() {
  const origin = await getServerRequestOrigin();
  const res = await fetch(`${origin}/api/picks`, {
    cache: "no-store",
  });
  return res.json();
}

function getCalendarMlbSnapshot(snapshot?: CalendarSnapshotSet | null) {
  return snapshot?.mlb ?? null;
}

function getCalendarNbaSnapshot(snapshot?: CalendarSnapshotSet | null) {
  return snapshot?.nba ?? null;
}

function getCalendarPublicFreePickIds(snapshot?: CalendarSnapshotSet | null) {
  return getFreshPublicFreePickIds(snapshot?.publicFreePicks, [snapshot?.mlb, snapshot?.nba]);
}

function getCalendarDisplayStars(
  pick: CalendarPick,
  snapshot?: CalendarSnapshotSet | null
) {
  const mlbSnapshot = pick.sport === "MLB" ? getCalendarMlbSnapshot(snapshot) : null;
  const frozenStars =
    pick.sport === "MLB"
      ? getMlbHistorySnapshotStar(mlbSnapshot, pick.id)
      : pick.sport === "NBA"
        ? getNbaHistorySnapshotStar(getCalendarNbaSnapshot(snapshot), pick.id)
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
    projected_side_margin: getCalendarProjectedSideMargin(pick),
    cover_buffer: getCalendarCoverBuffer(pick),
  }, frozenStars, Boolean(mlbSnapshot?.freePickIds?.includes(pick.id)));
}

function hasGameStarted(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

function getCardColor(pick: CalendarPick) {
  const gameStarted = hasGameStarted(pick.game_start_time);
  const resolvedStatus = resolvePickStatus(pick.status);

  if (resolvedStatus === "pending" && gameStarted) {
    return "border-sky-300 bg-sky-50/90";
  }
  if (resolvedStatus === "win") return "border-green-500 bg-green-50";
  if (resolvedStatus === "loss") return "border-red-500 bg-red-50";
  if (resolvedStatus === "push") return "border-yellow-500 bg-yellow-50";
  return "border-gray-300 bg-white";
}

function formatLine(value: number | null | undefined) {
  if (value === null || value === undefined) return "ML";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatProjectedScore(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined
) {
  if (!homeTeam || !awayTeam || homeScore === null || awayScore === null) return "Pregame score not saved";
  return `${awayTeam} ${awayScore} vs ${homeTeam} ${homeScore}`;
}

function formatPotentialPayout(odds: number | null | undefined, stakeUnits = STANDARD_PICK_STAKE_UNITS) {
  if (odds === null || odds === undefined) return "Pregame not saved";
  return `${(americanToProfitPerUnit(odds) * stakeUnits).toFixed(2)}u`;
}

function getPayoutPerUnit(odds: number | null | undefined) {
  if (odds === null || odds === undefined) return 0;
  return americanToProfitPerUnit(odds);
}

function formatStartTime(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatEdge(value: number | null | undefined, sport: string, marketType: string | null | undefined) {
  if (value === null || value === undefined) return "Pregame edge unavailable";
  if (sport !== "MLB") return `${value}`;
  if (marketType === "moneyline") return `${value}% win probability`;
  if (marketType === "spread") return `${value} runs`;
  if (marketType === "total") return `${value} runs`;
  return `${value}`;
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

function getCalendarProjectedMargin(pick: CalendarPick) {
  if (
    pick.projected_home_score === null ||
    pick.projected_home_score === undefined ||
    pick.projected_away_score === null ||
    pick.projected_away_score === undefined
  ) {
    return null;
  }

  return pick.projected_home_score - pick.projected_away_score;
}

function getCalendarProjectedSideMargin(pick: CalendarPick) {
  if (pick.projected_side_margin !== null && pick.projected_side_margin !== undefined) {
    return pick.projected_side_margin;
  }

  const projectedMargin = getCalendarProjectedMargin(pick);
  if (projectedMargin === null) return null;

  if (pick.market_type === "moneyline" || pick.market_type === "spread") {
    const normalizedSide = pick.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "").trim();
    if (pick.home_team && normalizedSide === pick.home_team) return projectedMargin;
    if (pick.away_team && normalizedSide === pick.away_team) return projectedMargin * -1;
  }

  return null;
}

function getCalendarCoverBuffer(pick: CalendarPick) {
  if (pick.cover_buffer !== null && pick.cover_buffer !== undefined) {
    return pick.cover_buffer;
  }

  if (pick.market_type !== "spread" || pick.line_taken === null || pick.line_taken === undefined) {
    return null;
  }

  const projectedSideMargin = getCalendarProjectedSideMargin(pick);
  if (projectedSideMargin === null) return null;

  return Number((projectedSideMargin + pick.line_taken).toFixed(2));
}

function isHistoricalTopPick(
  row: CalendarPick,
  snapshot?: CalendarSnapshotSet | null
) {
  const mlbSnapshot = getCalendarMlbSnapshot(snapshot);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotTopPick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getCalendarNbaSnapshot(snapshot);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotTopPick(nbaSnapshot, row.id);
  }

  return Boolean(row.is_top_pick);
}

function isHistoricalBestValuePick(
  row: CalendarPick,
  snapshot?: CalendarSnapshotSet | null
) {
  const mlbSnapshot = getCalendarMlbSnapshot(snapshot);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotBestValuePick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getCalendarNbaSnapshot(snapshot);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotBestValuePick(nbaSnapshot, row.id);
  }

  return row.notes === "best_value";
}

function isOfficialHistoricalCalendarPick(
  row: CalendarPick,
  snapshot?: CalendarSnapshotSet | null
) {
  const mlbSnapshot = getCalendarMlbSnapshot(snapshot);
  if (row.sport === "MLB" && (row.market_scope === "team" || row.market_scope === "player_prop") && mlbSnapshot) {
    return isMlbSnapshotOfficialPick(mlbSnapshot, row.id);
  }

  const nbaSnapshot = getCalendarNbaSnapshot(snapshot);
  if (row.sport === "NBA" && (row.market_scope === "team" || row.market_scope === "player_prop") && nbaSnapshot) {
    return isNbaSnapshotOfficialPick(nbaSnapshot, row.id);
  }

  return Boolean(row.is_top_pick) || row.notes === "best_value";
}

function isTopOrValuePick(
  row: CalendarPick,
  snapshot?: CalendarSnapshotSet | null
) {
  return isHistoricalTopPick(row, snapshot) || isHistoricalBestValuePick(row, snapshot);
}

function isTeamFreePickEligible(pick: CalendarPick) {
  const stars = getCalendarDisplayStars(pick);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const projectedSideMargin = getCalendarProjectedSideMargin(pick);
  const coverBuffer = getCalendarCoverBuffer(pick);

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

function isPropFreePickEligible(pick: CalendarPick) {
  const stars = getCalendarDisplayStars(pick);
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

function isFreePickEligible(pick: CalendarPick) {
  return isTeamFreePickEligible(pick) || isPropFreePickEligible(pick);
}

function getFreePickScore(pick: CalendarPick) {
  const payout = getPayoutPerUnit(pick.odds_taken);
  const stars = getCalendarDisplayStars(pick);
  const confidence = Number(pick.confidence_score ?? stars * 20);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const projectedSideMargin = getCalendarProjectedSideMargin(pick);
  const coverBuffer = getCalendarCoverBuffer(pick);
  const projectedLine = Number(pick.projected_line ?? NaN);
  const marketLine = Number(pick.market_line ?? pick.line_taken ?? NaN);
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

function buildFreePickRows(
  rows: CalendarPick[],
  snapshot?: CalendarSnapshotSet | null
) {
  return rankPublicFreePickRowsForHistory(rows, getCalendarPublicFreePickIds(snapshot));
}

function filterBySport(rows: CalendarPick[], sport: string) {
  if (sport === "all") return rows;
  return rows.filter((row) => row.sport === sport);
}

function filterByScope(rows: CalendarPick[], scope: string) {
  if (scope === "all") return rows;
  return rows.filter((row) => row.market_scope === scope);
}

const BOARD_FILTER_VALUES = new Set(["free", "top", "value"]);
const STAR_FILTER_VALUES = new Set(["1", "2", "3", "4", "5"]);

function matchesBoardFilter(
  row: CalendarPick,
  boardFilter: string,
  freePickIds: Set<number>,
  snapshot?: CalendarSnapshotSet | null
) {
  if (boardFilter === "free") return freePickIds.has(row.id);
  if (boardFilter === "top") return isHistoricalTopPick(row, snapshot);
  if (boardFilter === "value") return isHistoricalBestValuePick(row, snapshot);
  return true;
}

function filterByRating(
  rows: CalendarPick[],
  rating: string[],
  freePickIds: Set<number>,
  snapshot?: CalendarSnapshotSet | null
) {
  if (rating.length === 0) return rows;

  const selectedBoardFilters = rating.filter((value) => BOARD_FILTER_VALUES.has(value));
  const selectedStarFilters = rating.filter((value) => STAR_FILTER_VALUES.has(value));

  return rows.filter((row) => {
    const matchesBoard =
      selectedBoardFilters.length === 0 ||
      selectedBoardFilters.some((boardFilter) => matchesBoardFilter(row, boardFilter, freePickIds, snapshot));
    const matchesStars =
      selectedStarFilters.length === 0 ||
      selectedStarFilters.some((starFilter) => getCalendarDisplayStars(row, snapshot) === Number(starFilter));

    return matchesBoard && matchesStars;
  });
}

function getDisplayDate(pick: CalendarPick) {
  if (!pick.game_start_time) return pick.pick_date;

  const gameStart = new Date(pick.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return pick.pick_date;

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

function dedupeCalendarPicks(rows: CalendarPick[]) {
  const deduped = new Map<string, CalendarPick>();

  for (const row of rows) {
    const key = [
      row.pick_date,
      row.sport,
      row.game_label,
      row.market_scope ?? "",
      row.market_type ?? "",
      row.player_name ?? "",
      row.side,
      row.line_taken ?? "",
    ].join("::");

    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    const existingCreated = existing.created_at ? new Date(existing.created_at).getTime() : 0;
    const rowCreated = row.created_at ? new Date(row.created_at).getTime() : 0;

    if (rowCreated > existingCreated) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}

function sortCalendarPicks(rows: CalendarPick[]) {
  return [...rows].sort((a, b) => {
    const aStart = a.game_start_time ? new Date(a.game_start_time).getTime() : Number.MAX_SAFE_INTEGER;
    const bStart = b.game_start_time ? new Date(b.game_start_time).getTime() : Number.MAX_SAFE_INTEGER;

    if (aStart !== bStart) return aStart - bStart;

    const labelCompare = a.game_label.localeCompare(b.game_label);
    if (labelCompare !== 0) return labelCompare;

    const scopeCompare = (a.market_scope ?? "").localeCompare(b.market_scope ?? "");
    if (scopeCompare !== 0) return scopeCompare;

    const playerCompare = (a.player_name ?? "").localeCompare(b.player_name ?? "");
    if (playerCompare !== 0) return playerCompare;

    return a.id - b.id;
  });
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; sport?: string; scope?: string; rating?: string }>;
}) {
  const params = await searchParams;
  const allPicksResponse = await getAllPicks();
  const allPicks = filterOfficialHistoricalPicks(
    dedupeCalendarPicks((allPicksResponse.data ?? []) as CalendarPick[])
  );

  const uniqueDates = Array.from(new Set(allPicks.map(getDisplayDate))).sort((a, b) => b.localeCompare(a));

  const selectedDate = params.date ?? uniqueDates[0] ?? new Date().toISOString().slice(0, 10);
  const sport =
    params.sport === "NBA" || params.sport === "MLB" || params.sport === "SOCCER"
      ? params.sport
      : "all";
  const scope =
    params.scope === "team" || params.scope === "player_prop" ? params.scope : "all";
  const validRatingValues = new Set(["free", "top", "value", "1", "2", "3", "4", "5"]);
  const rating = (params.rating ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => validRatingValues.has(value));

  const selectedSnapshot = {
    mlb: await getMlbHistorySnapshot(selectedDate),
    nba: await getNbaHistorySnapshot(selectedDate),
    publicFreePicks: await getPublicFreePickHistory(selectedDate),
  };
  const datePicks = allPicks
    .filter((pick) => getDisplayDate(pick) === selectedDate)
    .filter((pick) => isOfficialHistoricalCalendarPick(pick, selectedSnapshot));
  const baseDatePicks = filterByScope(filterBySport(datePicks, sport), scope);
  const freePickRows = buildFreePickRows(baseDatePicks, selectedSnapshot);
  const freePickIds = new Set(freePickRows.map((pick) => pick.id));
  const freePickRankById = new Map(freePickRows.map((pick, index) => [pick.id, index + 1]));
  const filteredPicks = sortCalendarPicks(filterByRating(baseDatePicks, rating, freePickIds, selectedSnapshot));
  const visiblePitcherStrikeoutPicks = Array.from(
    new Map(
      [...freePickRows, ...filteredPicks]
        .filter((pick) => pick.market_scope === "player_prop" && pick.market_type === "pitcher_strikeouts")
        .map((pick) => [pick.id, pick] as const)
    ).values()
  );
  const pitcherPropDetailsById = new Map<number, MlbPitcherPropDetails>();

  for (const [index, details] of (
    await Promise.all(visiblePitcherStrikeoutPicks.map((pick) => getMlbPitcherPropDetails(pick)))
  ).entries()) {
    const pick = visiblePitcherStrikeoutPicks[index];
    if (pick?.id && details) {
      pitcherPropDetailsById.set(pick.id, details);
    }
  }

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-sky-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-sky-900 mb-3">
          Slate archive
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Calendar</h1>
        <p className="text-slate-600 max-w-2xl">
          Browse saved betting days, isolate the strongest plays, and review how picks looked when they were made.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {uniqueDates.length === 0 ? (
          <div className="text-gray-600">No saved dates yet.</div>
        ) : (
          uniqueDates.map((date) => (
            <Link
              key={date}
              href={`/calendar?date=${date}&sport=${sport}&scope=${scope}${rating.length ? `&rating=${rating.join(",")}` : ""}`}
              className={`app-pill px-4 py-2 rounded-full ${
                selectedDate === date ? "app-pill-active" : "text-slate-800"
              }`}
            >
              {date}
            </Link>
          ))
        )}
      </div>

      <CalendarFilterSelect date={selectedDate} sport={sport} scope={scope} rating={rating} />

      <section className="mb-8">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          5-star picks: payout floor off | 4-star floor: {FREE_PICK_PAYOUT_FLOOR.toFixed(2)}u
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="app-section-title mb-2">Free Picks for {selectedDate}</h2>
            <p className="text-slate-600 max-w-3xl">
              Best 3 MLB/NBA plays from Top Picks and Best Value, sorted by public Free Pick rules. {FREE_PICK_STAKING_NOTE}
            </p>
          </div>
          <Link
            href={`/calendar?date=${selectedDate}&sport=${sport}&scope=${scope}&rating=free`}
            className="app-pill px-4 py-2 rounded-full text-slate-800"
          >
            View Free Picks Only
          </Link>
        </div>

        {freePickRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-5 text-sm text-slate-600">
            No Free Picks qualified for this date and filter set.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {freePickRows.map((pick, index) => (
              <div key={`free-${pick.id}`} className={`rounded-3xl p-5 shadow-sm ${getCardColor(pick)}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900">
                    Free Pick #{index + 1}
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700">
                    {getConfidenceLabel(getCalendarDisplayStars(pick, selectedSnapshot))}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-slate-950 mb-2">{pick.game_label}</h3>
                <p className="text-slate-700">
                  <strong>Pick:</strong> {pick.side}
                </p>
                {pick.market_scope === "player_prop" && pick.player_name && (
                  <p className="text-slate-700">
                    <strong>Player:</strong> {pick.player_name}
                  </p>
                )}
                <p className="text-slate-700">
                  <strong>Market:</strong> {pick.market_scope ?? "N/A"} / {pick.market_type ?? "N/A"}
                </p>
                <p className="text-slate-700">
                  <strong>Start Time:</strong> {formatStartTime(pick.game_start_time)} ET
                </p>
                <p className="text-slate-700">
                  <strong>Stake:</strong> {FREE_PICK_STAKE_UNITS}u
                </p>
                <p className="text-slate-700">
                  <strong>Potential payout:</strong> {formatPotentialPayout(pick.odds_taken, FREE_PICK_STAKE_UNITS)}
                </p>
                <p className="text-slate-700">
                  <strong>Status:</strong> {getPickStatusLabel(pick.status)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <h2 className="app-section-title mb-3">Picks for {selectedDate}</h2>

      {filteredPicks.length === 0 ? (
        <div className="app-panel rounded-3xl p-5">
          No picks match the selected date and filters yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPicks.map((pick) => {
            const gameStarted = hasGameStarted(pick.game_start_time);
            const freePickRank = freePickRankById.get(pick.id);
            const isPending = isPendingPickStatus(pick.status);
            const statusLabel = getPickStatusLabel(pick.status);

            return (
              <div key={pick.id} className={`rounded-3xl p-5 shadow-sm ${getCardColor(pick)}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <h3 className="text-xl font-semibold text-slate-950">{pick.game_label}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isPending && gameStarted && (
                      <div className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                        Started
                      </div>
                    )}
                    {freePickRank && (
                      <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900">
                        Free Pick #{freePickRank}
                      </div>
                    )}
                    {pick.locked_at && (
                      <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                        Locked
                      </div>
                    )}
                    <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700">
                      {pick.sport} | {getConfidenceLabel(getCalendarDisplayStars(pick, selectedSnapshot))}
                    </div>
                  </div>
                </div>
                <p className="text-slate-700">
                  <strong>Pick:</strong> {pick.side}
                </p>
                {pick.market_scope === "player_prop" && pick.player_name && (
                  <p className="text-slate-700">
                    <strong>Player:</strong> {pick.player_name}
                  </p>
                )}
                <p className="text-slate-700">
                  <strong>Market:</strong> {pick.market_scope ?? "N/A"} / {pick.market_type ?? "N/A"}
                </p>
                <p className="text-slate-700">
                  <strong>Line:</strong> {formatLine(pick.line_taken)}
                </p>
                <p className="text-slate-700">
                  <strong>Start Time:</strong> {formatStartTime(pick.game_start_time)} ET
                </p>
                {pick.sport === "MLB" && (
                  <>
                    <p className="text-slate-700">
                      <strong>Current odds:</strong> {pick.odds_taken ?? "Pregame not saved"}
                    </p>
                    {freePickRank ? (
                      <p className="text-slate-700">
                        <strong>Stake:</strong> {FREE_PICK_STAKE_UNITS}u
                      </p>
                    ) : null}
                    <p className="text-slate-700">
                      <strong>Potential payout:</strong>{" "}
                      {formatPotentialPayout(
                        pick.odds_taken,
                        freePickRank ? FREE_PICK_STAKE_UNITS : STANDARD_PICK_STAKE_UNITS
                      )}
                    </p>
                  </>
                )}
                <p className="text-slate-700">
                  <strong>Predicted Score:</strong>{" "}
                  {formatProjectedScore(
                    pick.home_team,
                    pick.away_team,
                    pick.projected_home_score,
                    pick.projected_away_score
                  )}
                </p>
                <p className="text-slate-700">
                  <strong>Final Score:</strong> {pick.final_score ?? "Pending"}
                </p>
                {pick.market_scope === "player_prop" && (
                  <p className="text-slate-700">
                    <strong>Final Stat:</strong> {pick.final_stat ?? "Pending"}
                  </p>
                )}
                {pick.market_scope === "player_prop" && pick.market_type === "pitcher_strikeouts" && (
                  <p className="text-slate-700">
                    <strong>Final IP:</strong>{" "}
                    {isPending
                      ? "Pending"
                      : pitcherPropDetailsById.get(pick.id)?.finalInningsPitched ?? "Unavailable"}
                  </p>
                )}
                <p className="text-slate-700">
                  <strong>Status:</strong> {statusLabel}
                </p>
                <p className="text-slate-700">
                  <strong>Signal:</strong> {pick.edge_label ?? "N/A"}
                </p>
                <p className="text-slate-700">
                  <strong>Edge:</strong> {formatEdge(pick.edge, pick.sport, pick.market_type)}
                </p>
                <p className="text-slate-700">
                  <strong>Top Pick Rank:</strong> {pick.top_pick_rank ?? "Not ranked"}
                </p>
                <p className="text-slate-700">
                  <strong>Units Result:</strong>{" "}
                  {pick.units_result !== null && pick.units_result !== undefined
                    ? `${Number(pick.units_result).toFixed(2)}u`
                    : resolvePickStatus(pick.status) === "push"
                      ? "0.00u"
                      : "Pending"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
