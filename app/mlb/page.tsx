import Link from "next/link";
import AllSportsFreePicksBoard from "@/app/components/AllSportsFreePicksBoard";
import CollapsibleGameCard from "@/app/components/CollapsibleGameCard";
import FoldPanel from "@/app/components/FoldPanel";
import ResponsivePickDetails from "@/app/components/ResponsivePickDetails";
import SyncButton from "@/app/dashboard/SyncButton";
import { getCachedData } from "@/lib/cache";
import {
  getMlbPropAuditEventSnapshot,
  getMlbTeamAuditSnapshot,
  type MlbPropAuditRow,
  type MlbTeamAuditRow,
} from "@/lib/futureAudit";
import type { MlbContextMap } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import { americanToImpliedProb, evaluateMlbGames, type EvaluatedMlbGame, type MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import { getMlbDisplayStars } from "@/lib/mlbFreePicks";
import {
  getMlbHistorySnapshot,
  getMlbHistorySnapshotStar,
  getMlbSnapshotFreePickIds,
  getMlbSnapshotPropBestValueIds,
  getMlbSnapshotPropTopPickIds,
  getMlbSnapshotTeamBestValueIds,
  getMlbSnapshotTeamTopPickIds,
  getSnapshotOrderedRows,
} from "@/lib/mlbHistorySnapshot";
import {
  extractProjectedPitcherInnings,
  getMlbPitcherPropDetails,
  type MlbPitcherPropDetails,
} from "@/lib/mlbPitcherPropDetails";
import { getPickStatusLabel, isPostponedPickStatus, resolvePickStatus } from "@/lib/pickStatus";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import { getConfidenceLabel, getConfidenceStars } from "@/lib/starRatings";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { americanToProfitPerUnit } from "@/lib/units";
import { getManualSyncUsage, isOwnerLoggedIn } from "@/lib/ownerAuth";

const FREE_PICK_STAKE_UNITS = 2;
const STANDARD_PICK_STAKE_UNITS = 1;

type SavedMlbPropPick = {
  id: number;
  pick_date: string;
  sport?: string | null;
  market_scope?: string | null;
  external_event_id?: string | null;
  game_label: string;
  game_start_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  market_type?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  units_result?: number | null;
  locked_at?: string | null;
};

type SavedMlbTeamPick = {
  id: number;
  pick_date?: string | null;
  sport?: string | null;
  market_scope?: string | null;
  external_event_id?: string | null;
  game_label?: string | null;
  game_start_time?: string | null;
  market_type?: "moneyline" | "spread" | "total" | null;
  side: string;
  status?: string | null;
  line_taken?: number | null;
  odds_taken?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  final_score?: string | null;
  units_result?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
};

type MlbPropDiagnostics = {
  offeredCount?: number;
  rosterMatchedCount?: number;
  projectedCount?: number;
  passedFilterCount?: number;
  savedUniqueCount?: number;
  syncedCount?: number;
  gameLabel?: string;
  updatedAt?: string;
  error?: string | null;
};

type MlbScheduleStatusGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    home?: { team?: { name?: string } };
    away?: { team?: { name?: string } };
  };
  status?: {
    abstractGameState?: string;
    detailedState?: string;
  };
};

type MlbScheduleStatusResponse = {
  dates?: Array<{
    games?: MlbScheduleStatusGame[];
  }>;
};

type MlbScheduleStatusInfo = {
  gamePk: number | null;
  gameLabel: string;
  scheduledStart: string | null;
  abstractState: string;
  detailedState: string;
};

type MlbScheduleStatusIndex = {
  byGamePk: Map<number, MlbScheduleStatusInfo>;
  byLabel: Map<string, MlbScheduleStatusInfo[]>;
};

type SavedPickStartState = {
  pillLabel: string;
  summaryLabel: string;
  detail: string | null;
  pillClass: string;
  started: boolean;
};

type AuditLabelCount = {
  label: string;
  count: number;
};

const MLB_PROP_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "external_event_id",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "player_name",
  "market_type",
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
  "final_score",
  "final_stat",
  "units_result",
  "locked_at",
].join(",");

const MLB_TEAM_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "external_event_id",
  "game_label",
  "game_start_time",
  "market_type",
  "side",
  "status",
  "line_taken",
  "odds_taken",
  "edge",
  "edge_label",
  "confidence_score",
  "projected_home_score",
  "projected_away_score",
  "final_score",
  "units_result",
  "is_top_pick",
  "top_pick_rank",
  "notes",
].join(",");

function createEmptyScheduleStatusIndex(): MlbScheduleStatusIndex {
  return {
    byGamePk: new Map(),
    byLabel: new Map(),
  };
}

function normalizeGameLabel(awayTeam: string | null | undefined, homeTeam: string | null | undefined) {
  if (!awayTeam || !homeTeam) return null;
  return `${awayTeam} @ ${homeTeam}`;
}

async function fetchMlbScheduleStatusIndex(
  businessDate: string | null | undefined
): Promise<MlbScheduleStatusIndex> {
  if (!businessDate) return createEmptyScheduleStatusIndex();

  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${businessDate}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return createEmptyScheduleStatusIndex();
    }

    const data = (await response.json()) as MlbScheduleStatusResponse;
    const games = data.dates?.flatMap((entry) => entry.games ?? []) ?? [];
    const index = createEmptyScheduleStatusIndex();

    for (const game of games) {
      const gameLabel = normalizeGameLabel(game.teams?.away?.team?.name, game.teams?.home?.team?.name);
      if (!gameLabel) continue;

      const info: MlbScheduleStatusInfo = {
        gamePk: game.gamePk ?? null,
        gameLabel,
        scheduledStart: game.gameDate ?? null,
        abstractState: game.status?.abstractGameState ?? "",
        detailedState: game.status?.detailedState ?? "",
      };

      if (typeof info.gamePk === "number") {
        index.byGamePk.set(info.gamePk, info);
      }

      const existing = index.byLabel.get(gameLabel) ?? [];
      existing.push(info);
      index.byLabel.set(gameLabel, existing);
    }

    return index;
  } catch {
    return createEmptyScheduleStatusIndex();
  }
}

export default async function MlbPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const day = params.day === "yesterday" ? "yesterday" : "today";
  const [resolvedOdds, isOwner] = await Promise.all([
    getResolvedMlbOddsCache(day),
    isOwnerLoggedIn(),
  ]);
  const cachedOdds = (resolvedOdds.active as {
    businessDate?: string;
    data?: MlbOddsGame[];
    context?: MlbContextMap;
    learning?: MlbLearningProfile;
  } | null) ?? null;
  const staleBusinessDate = resolvedOdds.primary?.businessDate ?? null;
  const boardDate = cachedOdds?.businessDate ?? resolvedOdds.expectedBusinessDate;
  const evaluatedGames = evaluateMlbGames(
    cachedOdds?.data ?? [],
    mlbTeamRatings,
    mlbParkFactors,
    cachedOdds?.context,
    cachedOdds?.learning
  );
  const now = new Date();
  const slateGames = [...evaluatedGames].sort(
    (a, b) => new Date(a.game.commence_time).getTime() - new Date(b.game.commence_time).getTime()
  );
  const supabase = getSupabaseServer();
  const [
    scheduleStatusIndex,
    manualUsage,
    historySnapshot,
    propRowsResult,
    teamRowsResult,
  ] = await Promise.all([
    fetchMlbScheduleStatusIndex(boardDate),
    isOwner ? getManualSyncUsage() : Promise.resolve(null),
    boardDate ? getMlbHistorySnapshot(boardDate) : Promise.resolve(null),
    boardDate
      ? supabase
          .from("picks")
          .select(MLB_PROP_PICK_SELECT)
          .eq("pick_date", boardDate)
          .eq("sport", "MLB")
          .eq("market_scope", "player_prop")
          .order("is_top_pick", { ascending: false })
          .order("top_pick_rank", { ascending: true })
          .order("confidence_score", { ascending: false })
      : Promise.resolve({ data: [] as SavedMlbPropPick[] }),
    boardDate
      ? supabase
          .from("picks")
          .select(MLB_TEAM_PICK_SELECT)
          .eq("pick_date", boardDate)
          .eq("sport", "MLB")
          .eq("market_scope", "team")
      : Promise.resolve({ data: [] as SavedMlbTeamPick[] }),
  ]);
  const allPropPicks = (propRowsResult.data ?? []) as SavedMlbPropPick[];
  const allTeamPicks = (teamRowsResult.data ?? []) as SavedMlbTeamPick[];
  const teamPicksByEvent = allTeamPicks.reduce((map, pick) => {
    const eventId = pick.external_event_id;
    if (!eventId) return map;
    const existing = map.get(eventId) ?? [];
    existing.push(pick);
    map.set(eventId, existing);
    return map;
  }, new Map<string, SavedMlbTeamPick[]>());
  const teamPicksByLabel = allTeamPicks.reduce((map, pick) => {
    const label = pick.game_label;
    if (!label) return map;
    const existing = map.get(label) ?? [];
    existing.push(pick);
    map.set(label, existing);
    return map;
  }, new Map<string, SavedMlbTeamPick[]>());
  const completedTeamEventIds = new Set(
    Array.from(teamPicksByEvent.entries())
      .filter(([, picks]) => picks.length > 0 && picks.every((pick) => pick.status && pick.status !== "pending"))
      .map(([eventId]) => eventId)
  );
  const completedTeamLabels = new Set(
    Array.from(teamPicksByLabel.entries())
      .filter(([, picks]) => picks.length > 0 && picks.every((pick) => pick.status && pick.status !== "pending"))
      .map(([label]) => label)
  );
  const displaySlateGames = slateGames.filter((game) => {
    const gameLabel = `${game.game.away_team} @ ${game.game.home_team}`;
    return !completedTeamEventIds.has(game.game.id) && !completedTeamLabels.has(gameLabel);
  });
  const snapshotTeamTopPicks = getSnapshotOrderedRows(allTeamPicks, getMlbSnapshotTeamTopPickIds(historySnapshot));
  const snapshotTeamBestValuePicks = getSnapshotOrderedRows(allTeamPicks, getMlbSnapshotTeamBestValueIds(historySnapshot));
  const snapshotPropTopPicks = getSnapshotOrderedRows(allPropPicks, getMlbSnapshotPropTopPickIds(historySnapshot));
  const snapshotPropBestValuePicks = getSnapshotOrderedRows(allPropPicks, getMlbSnapshotPropBestValueIds(historySnapshot));
  const teamTopPicks =
    snapshotTeamTopPicks.length > 0
      ? snapshotTeamTopPicks
      : allTeamPicks
          .filter((pick) => pick.is_top_pick)
          .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99))
          .slice(0, 3);
  const teamBestValuePicks =
    snapshotTeamBestValuePicks.length > 0
      ? snapshotTeamBestValuePicks
      : allTeamPicks
          .filter((pick) => pick.notes === "best_value")
          .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
          .slice(0, 3);
  const propTopPicks =
    snapshotPropTopPicks.length > 0
      ? snapshotPropTopPicks
      : allPropPicks.filter((pick) => pick.is_top_pick).slice(0, 3);
  const propBestValuePicks =
    snapshotPropBestValuePicks.length > 0
      ? snapshotPropBestValuePicks
      : allPropPicks
          .filter((pick) => pick.notes === "best_value")
          .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
          .slice(0, 3);
  const hasSavedBoardPicks = allTeamPicks.length > 0 || allPropPicks.length > 0;
  const displayPitcherProps = [...propTopPicks, ...propBestValuePicks].filter(
    (pick, index, picks) =>
      pick.market_type === "pitcher_strikeouts" && picks.findIndex((entry) => entry.id === pick.id) === index
  );
  const pitcherPropDetails = new Map<number, MlbPitcherPropDetails>();
  const propPicksByEvent = new Map<string, SavedMlbPropPick[]>();
  const teamPickByEventAndMarket = new Map<string, SavedMlbTeamPick>();
  const teamPickByLabelAndMarket = new Map<string, SavedMlbTeamPick>();
  const propDiagnosticsByEvent = new Map<string, MlbPropDiagnostics>();
  const buildSavedPropAuditKey = (pick: SavedMlbPropPick) =>
    `${pick.game_label}|${pick.player_name ?? ""}|${pick.side}|${pick.line_taken ?? ""}`;
  const buildAuditPropKey = (row: MlbPropAuditRow) =>
    `${row.gameLabel}|${row.playerName} - ${row.playerTeamShort}|${row.side}|${row.line ?? ""}`;
  let teamAuditRows: MlbTeamAuditRow[] = [];
  let propAuditRows: MlbPropAuditRow[] = [];

  for (const [index, details] of (
    await Promise.all(displayPitcherProps.map((pick) => getMlbPitcherPropDetails(pick)))
  ).entries()) {
    const pick = displayPitcherProps[index];
    if (details && pick?.id) {
      pitcherPropDetails.set(pick.id, details);
    }
  }

  for (const pick of allPropPicks) {
    const eventId = pick.external_event_id;
    if (!eventId) continue;
    if (!propPicksByEvent.has(eventId)) propPicksByEvent.set(eventId, []);
    propPicksByEvent.get(eventId)?.push(pick);
  }

  for (const pick of allTeamPicks) {
    if (!pick.market_type) continue;
    const eventId = pick.external_event_id;
    if (eventId) {
      teamPickByEventAndMarket.set(`${eventId}::${pick.market_type}`, pick);
    }
    if (pick.game_label) {
      teamPickByLabelAndMarket.set(`${pick.game_label}::${pick.market_type}`, pick);
    }
  }

  const auditEventIds = Array.from(
    new Set([
      ...slateGames.map((game) => game.game.id),
      ...Array.from(propPicksByEvent.keys()),
    ])
  );

  if (boardDate) {
    const [diagnosticsRows, teamAuditSnapshot, propAuditSnapshots] = await Promise.all([
      Promise.all(
        auditEventIds.map((eventId) =>
          getCachedData(`mlb_prop_diag_${boardDate}_${eventId}`)
        )
      ),
      getMlbTeamAuditSnapshot(boardDate),
      Promise.all(
        auditEventIds.map((eventId) =>
          getMlbPropAuditEventSnapshot(boardDate, eventId)
        )
      ),
    ]);

    teamAuditRows = teamAuditSnapshot?.rows ?? [];
    propAuditRows = propAuditSnapshots.flatMap((snapshot) => snapshot?.rows ?? []);

    diagnosticsRows.forEach((diagnosticsRow, index) => {
      const eventId = auditEventIds[index];
      if (eventId && diagnosticsRow?.data) {
        propDiagnosticsByEvent.set(eventId, diagnosticsRow.data as MlbPropDiagnostics);
      }
    });
  }

  const selectedTopPropAuditKeys = new Set(propTopPicks.map((pick) => buildSavedPropAuditKey(pick)));
  const selectedBestValuePropAuditKeys = new Set(
    propBestValuePicks.map((pick) => buildSavedPropAuditKey(pick))
  );

  function countAuditLabels(labels: string[]) {
    const counts = new Map<string, number>();

    for (const label of labels) {
      const normalized = label.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 6);
  }

  const propPreferredAuditRows = propAuditRows.filter(
    (row) => row.currentModelPreferredSide === row.side
  );
  const propEligibleNearMissRows = propPreferredAuditRows
    .filter((row) => {
      const key = buildAuditPropKey(row);
      return (
        row.passesCurrentFilters &&
        !selectedTopPropAuditKeys.has(key) &&
        !selectedBestValuePropAuditKeys.has(key) &&
        (row.topPickScore !== null || row.lineClearProbability !== null)
      );
    })
    .sort((a, b) => (b.topPickScore ?? b.confidenceScore ?? 0) - (a.topPickScore ?? a.confidenceScore ?? 0))
    .slice(0, 6);
  const propBlockedAuditRows = propPreferredAuditRows.filter(
    (row) =>
      !row.passesCurrentFilters &&
      !selectedTopPropAuditKeys.has(buildAuditPropKey(row)) &&
      !selectedBestValuePropAuditKeys.has(buildAuditPropKey(row))
    );
  const propBlockedReasonCounts = countAuditLabels(
    propBlockedAuditRows.flatMap((row) =>
      (row.riskFlags ?? []).length > 0
        ? row.riskFlags ?? []
        : (row.reasonLabels ?? []).length > 0
          ? row.reasonLabels ?? []
          : ["No saved guardrail tag"]
    )
  );
  const propPreferredSelectedCount = propPreferredAuditRows.filter((row) => {
    const key = buildAuditPropKey(row);
    return selectedTopPropAuditKeys.has(key) || selectedBestValuePropAuditKeys.has(key);
  }).length;
  const propDiagnosticsTotals = Array.from(propDiagnosticsByEvent.values()).reduce(
    (totals, row) => ({
      offered: totals.offered + (row.offeredCount ?? 0),
      rosterMatched: totals.rosterMatched + (row.rosterMatchedCount ?? 0),
      projected: totals.projected + (row.projectedCount ?? 0),
      passed: totals.passed + (row.passedFilterCount ?? 0),
      saved: totals.saved + (row.savedUniqueCount ?? row.syncedCount ?? 0),
    }),
    { offered: 0, rosterMatched: 0, projected: 0, passed: 0, saved: 0 }
  );
  const teamPreferredAuditRows = teamAuditRows.filter((row) => row.selectedByCurrentModel);
  const teamPreferredMlTotalRows = teamPreferredAuditRows.filter(
    (row) => row.marketType === "moneyline" || row.marketType === "total"
  );
  const teamNearMissRows = teamPreferredAuditRows
    .filter(
      (row) =>
        (row.marketType === "moneyline" || row.marketType === "total") &&
        !row.currentSelectedBucket
    )
    .sort(
      (a, b) =>
        Math.max(b.topPickScore ?? -999, b.bestValueScore ?? -999) -
        Math.max(a.topPickScore ?? -999, a.bestValueScore ?? -999)
    )
    .slice(0, 6);
  const teamBlockedReasonCounts = countAuditLabels(
    teamNearMissRows.flatMap((row) =>
      (row.riskFlags ?? []).length > 0
        ? row.riskFlags ?? []
        : (row.reasonLabels ?? []).length > 0
          ? row.reasonLabels ?? []
          : ["No saved guardrail tag"]
    )
  );
  const teamPreferredSelectedCount = teamPreferredMlTotalRows.filter(
    (row) => row.currentSelectedBucket !== null
  ).length;

  function getSignalColor(signal: string) {
    if (signal === "Pass" || signal === "No model") return "text-slate-500";
    return "text-slate-700";
  }

  function formatPotentialPayout(odds: number | null | undefined, stakeUnits = STANDARD_PICK_STAKE_UNITS) {
    if (odds === null || odds === undefined) return "Pregame not saved";
    return `${(americanToProfitPerUnit(odds) * stakeUnits).toFixed(2)}u`;
  }

  function getPayoutPerUnit(odds: number | null | undefined) {
    if (odds === null || odds === undefined) return 0;
    return americanToProfitPerUnit(odds);
  }

  function getImpliedProb(odds: number | null | undefined) {
    if (odds === null || odds === undefined) return 0;
    return americanToImpliedProb(odds);
  }

  function formatEdge(value: number | null | undefined, marketType: "moneyline" | "spread" | "total") {
    if (value === null || value === undefined) return "Pregame edge unavailable";
    if (marketType === "moneyline") return `${value}% win probability`;
    if (marketType === "spread") return `${value} runs`;
    return `${value} runs`;
  }

  function formatSignedValue(value: number | null | undefined) {
    if (value === null || value === undefined) return "Locked line unavailable";
    if (value > 0) return `+${value}`;
    return `${value}`;
  }

  function getMoneylineSignalDisplay(item: EvaluatedMlbGame) {
    if (item.moneylineSignal?.includes("Home")) return `${item.game.home_team} ML`;
    if (item.moneylineSignal?.includes("Away")) return `${item.game.away_team} ML`;
    return item.moneylineSignal ?? "Pass";
  }

  function getRunLineSignalDisplay(item: EvaluatedMlbGame) {
    if (item.runLineSignal?.includes("Home")) {
      return `${item.game.home_team} ${formatSignedValue(item.marketHomeRunLine)}`;
    }
    if (item.runLineSignal?.includes("Away")) {
      return `${item.game.away_team} ${formatSignedValue(item.marketAwayRunLine)}`;
    }
    return item.runLineSignal ?? "Pass";
  }

  function getTotalSignalDisplay(item: EvaluatedMlbGame) {
    if (item.totalSignal?.includes("Over")) return `Over ${item.marketTotal ?? "N/A"}`;
    if (item.totalSignal?.includes("Under")) return `Under ${item.marketTotal ?? "N/A"}`;
    return item.totalSignal ?? "Pass";
  }

  function formatPropMarketLabel(value: string | null | undefined) {
    if (!value) return "Player Prop";
    return value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function splitEdgeLabel(value: string | null | undefined) {
    const parts = (value ?? "")
      .split(" | ")
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      signal: parts[0] ?? null,
      context: parts
        .filter(
          (part) =>
            /^proj\s+/i.test(part) ||
            part.includes("pitches") ||
            part.includes("BF") ||
            part.includes("order")
        )
        .join(" | "),
      reasons: parts
        .filter((part) => part.startsWith("Reasons:"))
        .map((part) => part.replace(/^Reasons:\s*/, ""))
        .join(", "),
      watch: parts
        .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
        .map((part) => part.replace(/^(Watch|Learning):\s*/, ""))
        .join(", "),
    };
  }

  function formatHealthUnits(value: number | null | undefined) {
    const numericValue = Number(value ?? 0);
    return `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(2)}u`;
  }

  function getPropMarketHealthRows() {
    return Object.values(cachedOdds?.learning?.propMarketHealth ?? {}).sort((a, b) =>
      formatPropMarketLabel(a.marketType).localeCompare(formatPropMarketLabel(b.marketType))
    );
  }

  function splitTaggedPlayerName(value: string | null | undefined) {
    const raw = value ?? "Unknown Player";
    const parts = raw.split(" - ");

    if (parts.length < 2) {
      return { displayName: raw, teamTag: null as string | null };
    }

    return {
      displayName: parts.slice(0, -1).join(" - "),
      teamTag: parts[parts.length - 1] ?? null,
    };
  }

  function formatCardStartTime(value: string | null | undefined) {
    if (!value) return "Time pending";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time pending";

    const etDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const bettingDay = boardDate;

    if (etDay === bettingDay) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }).format(date) + " ET";
    }

    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + " ET";
  }

  function getGameState(value: string) {
    const start = new Date(value);
    if (Number.isNaN(start.getTime())) return "scheduled" as const;
    if (start.getTime() <= now.getTime()) return "started" as const;
    return "scheduled" as const;
  }

  function resolveScheduleStatusInfo(params: {
    gamePk?: number | null;
    gameLabel?: string | null;
    gameStartTime?: string | null | undefined;
  }) {
    const { gamePk, gameLabel, gameStartTime } = params;

    if (typeof gamePk === "number") {
      const match = scheduleStatusIndex.byGamePk.get(gamePk);
      if (match) return match;
    }

    if (!gameLabel) return null;

    const matches = scheduleStatusIndex.byLabel.get(gameLabel) ?? [];
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0] ?? null;

    const startMs = gameStartTime ? new Date(gameStartTime).getTime() : NaN;
    if (Number.isNaN(startMs)) return matches[0] ?? null;

    return matches.reduce((closest, entry) => {
      const entryMs = entry.scheduledStart ? new Date(entry.scheduledStart).getTime() : NaN;
      if (Number.isNaN(entryMs)) return closest;
      if (!closest) return entry;

      const closestMs = closest.scheduledStart ? new Date(closest.scheduledStart).getTime() : NaN;
      if (Number.isNaN(closestMs)) return entry;

      return Math.abs(entryMs - startMs) < Math.abs(closestMs - startMs) ? entry : closest;
    }, matches[0] ?? null);
  }

  function isScheduleStatusStarted(status: MlbScheduleStatusInfo | null) {
    const abstractState = status?.abstractState.toLowerCase() ?? "";
    const detailedState = status?.detailedState.toLowerCase() ?? "";

    return (
      abstractState === "live" ||
      abstractState === "final" ||
      abstractState === "completed" ||
      detailedState.includes("in progress") ||
      detailedState.includes("final")
    );
  }

  function isScheduleStatusFinal(status: MlbScheduleStatusInfo | null) {
    const abstractState = status?.abstractState.toLowerCase() ?? "";
    const detailedState = status?.detailedState.toLowerCase() ?? "";

    return (
      abstractState === "final" ||
      abstractState === "completed" ||
      detailedState.includes("final")
    );
  }

  function isScheduleStatusPostponed(status: MlbScheduleStatusInfo | null) {
    const abstractState = status?.abstractState.toLowerCase() ?? "";
    const detailedState = status?.detailedState.toLowerCase() ?? "";

    return (
      abstractState.includes("postponed") ||
      detailedState.includes("postponed") ||
      detailedState.includes("cancelled") ||
      detailedState.includes("canceled")
    );
  }

  function getSavedPickStartState(
    value: string | null | undefined,
    scheduleStatus?: MlbScheduleStatusInfo | null,
    pickStatus?: string | null | undefined
  ): SavedPickStartState {
    const detailedState = scheduleStatus?.detailedState?.trim() || null;
    const resolvedPickStatus = resolvePickStatus(pickStatus);

    if (scheduleStatus) {
      if (isScheduleStatusPostponed(scheduleStatus)) {
        return {
          pillLabel: "Postponed",
          summaryLabel: "Postponed",
          detail: detailedState,
          pillClass: "border-amber-200/80 bg-amber-50 text-amber-800",
          started: false,
        };
      }

      if (isScheduleStatusFinal(scheduleStatus)) {
        return {
          pillLabel: "Final",
          summaryLabel: "Final",
          detail: detailedState && detailedState.toLowerCase() !== "final" ? detailedState : null,
          pillClass: "border-emerald-200/80 bg-emerald-50 text-emerald-800",
          started: true,
        };
      }

      if (isScheduleStatusStarted(scheduleStatus)) {
        return {
          pillLabel: "Started",
          summaryLabel: "Started",
          detail: detailedState && detailedState.toLowerCase() !== "in progress" ? detailedState : null,
          pillClass: "border-sky-200 bg-sky-100 text-sky-800",
          started: true,
        };
      }

      return {
        pillLabel:
          detailedState && detailedState.toLowerCase().includes("delayed")
            ? "Delayed Start"
            : "Not started",
        summaryLabel: "Not started",
        detail: detailedState,
        pillClass: "border-slate-200/80 bg-white/75 text-slate-700",
        started: false,
      };
    }

    if (resolvedPickStatus === "postponed" || (resolvedPickStatus === "push" && !value)) {
      return {
        pillLabel: "Postponed",
        summaryLabel: "Postponed",
        detail: null,
        pillClass: "border-amber-200/80 bg-amber-50 text-amber-800",
        started: false,
      };
    }

    if (resolvedPickStatus !== "pending") {
      return {
        pillLabel: "Final",
        summaryLabel: "Final",
        detail: null,
        pillClass: "border-emerald-200/80 bg-emerald-50 text-emerald-800",
        started: true,
      };
    }

    if (!value) {
      return {
        pillLabel: "Time pending",
        summaryLabel: "Start time pending",
        detail: null,
        pillClass: "border-slate-200/80 bg-slate-50 text-slate-700",
        started: false,
      };
    }

    const state = getGameState(value);

    if (state === "started") {
      return {
        pillLabel: "Started",
        summaryLabel: "Started",
        detail: null,
        pillClass: "border-sky-200 bg-sky-100 text-sky-800",
        started: true,
      };
    }

    return {
      pillLabel: "Not started",
      summaryLabel: "Not started",
      detail: null,
      pillClass: "border-slate-200/80 bg-white/75 text-slate-700",
      started: false,
    };
  }

  function formatSavedPickStartSummary(startState: SavedPickStartState) {
    if (startState.detail && startState.detail !== startState.summaryLabel) {
      return `${startState.summaryLabel} (${startState.detail})`;
    }

    return startState.summaryLabel;
  }

  function getStartedTeamSnapshot(item: EvaluatedMlbGame, marketType: "moneyline" | "spread" | "total") {
    return (
      teamPickByEventAndMarket.get(`${item.game.id}::${marketType}`) ??
      teamPickByLabelAndMarket.get(`${item.game.away_team} @ ${item.game.home_team}::${marketType}`) ??
      null
    );
  }

  function getStartedMarketDisplay(
    snapshot: SavedMlbTeamPick | null,
    fallback: string
  ) {
    if (!snapshot) return fallback;
    if (snapshot.odds_taken === null || snapshot.odds_taken === undefined) {
      return snapshot.side || fallback;
    }
    return `${snapshot.side} (${snapshot.odds_taken})`;
  }

  function renderStarterSummary(item: EvaluatedMlbGame) {
    const homeStarter = item.context?.homeStarter;
    const awayStarter = item.context?.awayStarter;

    if (!homeStarter && !awayStarter) {
      return <p className="text-sm text-slate-600">Starter context is still using team-level pitching fallback.</p>;
    }

    return (
      <div className="space-y-1 text-sm text-slate-600">
        {awayStarter && (
          <p>
            <strong>{item.game.away_team} starter:</strong> {awayStarter.name} ({awayStarter.hand}) | Rating{" "}
            {awayStarter.rating}
            {awayStarter.statsSummary ? ` | ${awayStarter.statsSummary}` : ""}
          </p>
        )}
        {homeStarter && (
          <p>
            <strong>{item.game.home_team} starter:</strong> {homeStarter.name} ({homeStarter.hand}) | Rating{" "}
            {homeStarter.rating}
            {homeStarter.statsSummary ? ` | ${homeStarter.statsSummary}` : ""}
          </p>
        )}
      </div>
    );
  }

  function renderInjurySummary(item: EvaluatedMlbGame) {
    const homeInjuries = item.context?.homeInjuries ?? [];
    const awayInjuries = item.context?.awayInjuries ?? [];
    const homeImpact = item.context?.homeInjuryImpact ?? 0;
    const awayImpact = item.context?.awayInjuryImpact ?? 0;

    if (homeInjuries.length === 0 && awayInjuries.length === 0) {
      return <p className="text-sm text-slate-600">No recent injury-list notes pulled into the model for this matchup.</p>;
    }

    return (
      <div className="space-y-2 text-sm text-slate-600">
        {awayInjuries.length > 0 && (
          <p>
            <strong>{item.game.away_team} notes:</strong> {awayInjuries.map((note) => `${note.playerName} (${note.note})`).join(", ")}
            {awayImpact > 0 ? ` | modeled impact ${awayImpact.toFixed(2)}` : ""}
          </p>
        )}
        {homeInjuries.length > 0 && (
          <p>
            <strong>{item.game.home_team} notes:</strong> {homeInjuries.map((note) => `${note.playerName} (${note.note})`).join(", ")}
            {homeImpact > 0 ? ` | modeled impact ${homeImpact.toFixed(2)}` : ""}
          </p>
        )}
      </div>
    );
  }

  function formatTeamMarketLabel(value: SavedMlbTeamPick["market_type"]) {
    if (value === "moneyline") return "Moneyline";
    if (value === "spread") return "Run Line";
    if (value === "total") return "Total";
    return "Team Bet";
  }

  function getSavedCardClass(status: string | null | undefined) {
    const resolvedStatus = resolvePickStatus(status);

    if (resolvedStatus === "win") return "app-panel h-full rounded-3xl p-5 border-emerald-200/80";
    if (resolvedStatus === "loss") return "app-panel h-full rounded-3xl p-5 border-rose-200/80";
    if (resolvedStatus === "push") return "app-panel h-full rounded-3xl p-5 border-amber-200/80";
    return "app-panel h-full rounded-3xl p-5";
  }

  function getSavedCardStyle(status: string | null | undefined) {
    const resolvedStatus = resolvePickStatus(status);

    if (resolvedStatus === "win") {
      return { background: "linear-gradient(180deg, rgba(236, 253, 245, 0.96) 0%, rgba(220, 252, 231, 0.92) 100%)" };
    }
    if (resolvedStatus === "loss") {
      return { background: "linear-gradient(180deg, rgba(255, 241, 242, 0.96) 0%, rgba(254, 226, 226, 0.92) 100%)" };
    }
    if (resolvedStatus === "push") {
      return { background: "linear-gradient(180deg, rgba(255, 251, 235, 0.96) 0%, rgba(254, 243, 199, 0.92) 100%)" };
    }
    return undefined;
  }

  function getProjectedMarginFromSavedPick(pick: SavedMlbTeamPick) {
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

  function getSavedProjectedSideMargin(pick: SavedMlbTeamPick) {
    if (pick.projected_side_margin !== null && pick.projected_side_margin !== undefined) {
      return pick.projected_side_margin;
    }

    const projectedMargin = getProjectedMarginFromSavedPick(pick);
    if (projectedMargin === null || !pick.game_label) return null;

    const [awayTeam, homeTeam] = pick.game_label.split(" @ ");
    if (pick.market_type === "moneyline" || pick.market_type === "spread") {
      const normalizedSide = pick.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "").trim();
      if (normalizedSide === homeTeam) return projectedMargin;
      if (normalizedSide === awayTeam) return projectedMargin * -1;
    }

    return null;
  }

  function getSavedCoverBuffer(pick: SavedMlbTeamPick) {
    if (pick.cover_buffer !== null && pick.cover_buffer !== undefined) {
      return pick.cover_buffer;
    }

    if (pick.market_type !== "spread" || pick.line_taken === null || pick.line_taken === undefined) {
      return null;
    }

    const projectedSideMargin = getSavedProjectedSideMargin(pick);
    if (projectedSideMargin === null) return null;

    return Number((projectedSideMargin + pick.line_taken).toFixed(2));
  }

  function getSavedTeamStars(pick: SavedMlbTeamPick) {
    const frozenStars = getMlbHistorySnapshotStar(historySnapshot, pick.id);
    const isFrozenFreePick = getMlbSnapshotFreePickIds(historySnapshot).includes(pick.id);
    return getMlbDisplayStars({
      ...pick,
      sport: "MLB",
      market_scope: "team",
      projected_side_margin: getSavedProjectedSideMargin(pick),
      cover_buffer: getSavedCoverBuffer(pick),
    }, frozenStars, isFrozenFreePick);
  }

  function getSavedPropStars(prop: SavedMlbPropPick) {
    const frozenStars = getMlbHistorySnapshotStar(historySnapshot, prop.id);
    const isFrozenFreePick = getMlbSnapshotFreePickIds(historySnapshot).includes(prop.id);
    return getMlbDisplayStars({
      ...prop,
      sport: "MLB",
      market_scope: "player_prop",
    }, frozenStars, isFrozenFreePick);
  }

  const propMarketHealthRows = getPropMarketHealthRows();

  function renderSavedTeamCard(pick: SavedMlbTeamPick, label: string, rank?: number) {
    const labelParts = splitEdgeLabel(pick.edge_label);
    const statusLabel = getPickStatusLabel(pick.status);
    const isFreePickLabel = label === "Free Pick";
    const stakeUnits = isFreePickLabel ? FREE_PICK_STAKE_UNITS : STANDARD_PICK_STAKE_UNITS;
    const scheduleStatus = resolveScheduleStatusInfo({
      gameLabel: pick.game_label,
      gameStartTime: pick.game_start_time,
    });
    const startState = getSavedPickStartState(pick.game_start_time, scheduleStatus, pick.status);

    return (
      <div key={`${label}-${pick.id}`} className={`${getSavedCardClass(pick.status)} compact-pick-card`} style={getSavedCardStyle(pick.status)}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">
              {label}
              {rank ? ` #${rank}` : ""}
            </div>
            <h3 className="compact-pick-title text-xl font-semibold text-slate-950">{pick.game_label ?? "MLB Game"}</h3>
          </div>
          <div className="compact-pick-badges flex max-w-[46%] flex-wrap items-center justify-end gap-1.5 shrink-0">
            <div className="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              {formatCardStartTime(pick.game_start_time ?? null)}
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-xs font-medium ${startState.pillClass}`}>
              {startState.pillLabel}
            </div>
            <div className="compact-pick-star-badge rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700">
              {getConfidenceLabel(
                getSavedTeamStars(pick)
              )}
            </div>
          </div>
        </div>

        <div className="compact-pick-summary">
          <p><strong>Pick:</strong> {pick.side}</p>
          <p><strong>Market:</strong> {formatTeamMarketLabel(pick.market_type)}</p>
          <p><strong>Odds:</strong> {pick.odds_taken ?? "N/A"}</p>
          {pick.projected_away_score !== null &&
            pick.projected_away_score !== undefined &&
            pick.projected_home_score !== null &&
            pick.projected_home_score !== undefined && (
          <p>
            <strong>Prediction:</strong> {pick.game_label?.split(" @ ")[0] ?? "Away"}{" "}
            {pick.projected_away_score} - {pick.game_label?.split(" @ ")[1] ?? "Home"}{" "}
            {pick.projected_home_score}
          </p>
          )}
        </div>

        <ResponsivePickDetails>
          <p>
            <strong>Pick:</strong> {pick.side}
          </p>
          <p>
            <strong>Market:</strong> {formatTeamMarketLabel(pick.market_type)}
          </p>
          {pick.line_taken !== null && pick.line_taken !== undefined && (
            <p>
              <strong>Line:</strong> {pick.line_taken}
            </p>
          )}
          <p>
            <strong>Current odds:</strong> {pick.odds_taken ?? "N/A"}
          </p>
          {isFreePickLabel ? (
            <p>
              <strong>Stake:</strong> {FREE_PICK_STAKE_UNITS}u
            </p>
          ) : null}
          <p>
            <strong>Potential payout:</strong> {formatPotentialPayout(pick.odds_taken, stakeUnits)}
          </p>
          <p>
            <strong>Game state:</strong> {formatSavedPickStartSummary(startState)}
          </p>
          {pick.projected_away_score !== null &&
            pick.projected_away_score !== undefined &&
            pick.projected_home_score !== null &&
            pick.projected_home_score !== undefined && (
          <p>
            <strong>Predicted score:</strong> {pick.game_label?.split(" @ ")[0] ?? "Away"}{" "}
            {pick.projected_away_score} - {pick.game_label?.split(" @ ")[1] ?? "Home"}{" "}
            {pick.projected_home_score}
          </p>
          )}
          {pick.final_score && (
            <p>
              <strong>Final score:</strong> {pick.final_score}
            </p>
          )}
          <p>
            <strong>Signal:</strong> {labelParts.signal ?? pick.side}
          </p>
          {labelParts.reasons && (
            <p>
              <strong>Why:</strong> {labelParts.reasons}
            </p>
          )}
          {labelParts.watch && (
            <p>
              <strong>Watch:</strong> {labelParts.watch}
            </p>
          )}
          <p>
            <strong>Edge:</strong> {formatEdge(pick.edge, pick.market_type ?? "spread")}
          </p>
          <p>
            <strong>Status:</strong> {statusLabel}
          </p>
        </ResponsivePickDetails>
      </div>
    );
  }

  function renderPropCard(prop: SavedMlbPropPick, label: string, rank?: number) {
    const { displayName, teamTag } = splitTaggedPlayerName(prop.player_name);
    const labelParts = splitEdgeLabel(prop.edge_label);
    const isFreePickLabel = label === "Free Pick";
    const stakeUnits = isFreePickLabel ? FREE_PICK_STAKE_UNITS : STANDARD_PICK_STAKE_UNITS;
    const pitcherDetails = prop.id ? pitcherPropDetails.get(prop.id) ?? null : null;
    const statusLabel = getPickStatusLabel(prop.status);
    const isPostponed = isPostponedPickStatus(prop.status);
    const resolvedStatus = resolvePickStatus(prop.status);
    const scheduleStatus = resolveScheduleStatusInfo({
      gameLabel: prop.game_label,
      gameStartTime: prop.game_start_time,
    });
    const startState = getSavedPickStartState(prop.game_start_time, scheduleStatus, prop.status);
    const projectedInnings =
      pitcherDetails?.projectedInnings ?? extractProjectedPitcherInnings(prop.edge_label);

    return (
      <div key={`${label}-${prop.id}`} className={`${getSavedCardClass(prop.status)} compact-pick-card`} style={getSavedCardStyle(prop.status)}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">
              {label}
              {rank ? ` #${rank}` : ""}
            </div>
            <h3 className="compact-pick-title text-xl font-semibold text-slate-950">
              {displayName}
              {teamTag ? ` - ${teamTag}` : ""}
            </h3>
            <p className="text-sm text-slate-500 whitespace-nowrap">{prop.game_label}</p>
          </div>
          <div className="compact-pick-badges flex max-w-[46%] flex-wrap items-center justify-end gap-1.5 shrink-0">
            <div className="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              {formatCardStartTime(prop.game_start_time ?? null)}
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-xs font-medium ${startState.pillClass}`}>
              {startState.pillLabel}
            </div>
            <div className="compact-pick-star-badge rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700">
              {getConfidenceLabel(
                getSavedPropStars(prop)
              )}
            </div>
          </div>
        </div>

        <div className="compact-pick-summary">
          <p><strong>Prop:</strong> {formatPropMarketLabel(prop.market_type)}</p>
          <p><strong>Pick:</strong> {prop.side}</p>
          <p><strong>Line:</strong> {prop.market_line ?? prop.line_taken ?? "N/A"}</p>
          <p><strong>Odds:</strong> {prop.odds_taken ?? "N/A"}</p>
        </div>

        <ResponsivePickDetails>
          <p>
            <strong>Prop:</strong> {formatPropMarketLabel(prop.market_type)}
          </p>
          <p>
            <strong>Pick:</strong> {prop.side}
          </p>
          <p>
            <strong>Market line:</strong> {prop.market_line ?? prop.line_taken ?? "N/A"}
          </p>
          <p>
            <strong>Projected line:</strong> {prop.projected_line ?? "N/A"}
          </p>
          {prop.market_type === "pitcher_strikeouts" && projectedInnings !== null && (
            <p>
              <strong>Projected IP:</strong> {projectedInnings.toFixed(1)}
            </p>
          )}
          {prop.market_type === "pitcher_strikeouts" && labelParts.context && (
            <p>
              <strong>Pitch model:</strong> {labelParts.context}
            </p>
          )}
          <p>
            <strong>Current odds:</strong> {prop.odds_taken ?? "N/A"}
          </p>
          {isFreePickLabel ? (
            <p>
              <strong>Stake:</strong> {FREE_PICK_STAKE_UNITS}u
            </p>
          ) : null}
          <p>
            <strong>Potential payout:</strong> {formatPotentialPayout(prop.odds_taken, stakeUnits)}
          </p>
          <p>
            <strong>Game state:</strong> {formatSavedPickStartSummary(startState)}
          </p>
          <p>
            <strong>Signal:</strong> {labelParts.signal ?? "N/A"}
          </p>
          {labelParts.reasons && (
            <p>
              <strong>Why:</strong> {labelParts.reasons}
            </p>
          )}
          {labelParts.watch && (
            <p>
              <strong>Watch:</strong> {labelParts.watch}
            </p>
          )}
          <p>
            <strong>Edge:</strong> {prop.edge ?? "N/A"}
          </p>
          {prop.final_score && (
            <p>
              <strong>Final score:</strong> {prop.final_score}
            </p>
          )}
          {prop.market_type === "pitcher_strikeouts" && resolvedStatus !== "pending" && !isPostponed && (
            <p>
              <strong>Final line:</strong>{" "}
              {pitcherDetails?.finalInningsPitched ?? "N/A"} IP |{" "}
              {pitcherDetails?.finalPitchesThrown ?? "N/A"} pitches |{" "}
              {pitcherDetails?.finalStrikeouts ?? prop.final_stat ?? "N/A"} Ks
            </p>
          )}
          <p>
            <strong>Status:</strong> {statusLabel}
            {prop.locked_at ? " | Locked" : ""}
          </p>
        </ResponsivePickDetails>
      </div>
    );
  }

  function renderEmptyBoardCell(message: string) {
    return (
      <div className="compact-pick-empty flex h-full min-h-[11rem] items-center rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-5 text-sm text-slate-600">
        {message}
      </div>
    );
  }

  function getBoardRowCount(leftCount: number, rightCount: number) {
    return Math.max(leftCount, rightCount, 1);
  }

  function renderPropDiagnostics(eventId: string) {
    const diagnostics = propDiagnosticsByEvent.get(eventId);
    if (!diagnostics) {
      return (
        <p className="text-sm text-slate-600">
          No prop sync summary yet. After you click <strong>Sync Props</strong>, this will show how many props were offered, passed, and saved.
        </p>
      );
    }

    if (diagnostics.error) {
      return (
        <p className="text-sm text-rose-700">
          Prop sync issue: <strong>{diagnostics.error}</strong>
        </p>
      );
    }

    return (
      <p className="text-sm text-slate-600">
        Props offered: <strong>{diagnostics.offeredCount ?? 0}</strong> | Roster matched:{" "}
        <strong>{diagnostics.rosterMatchedCount ?? 0}</strong> | Projected:{" "}
        <strong>{diagnostics.projectedCount ?? 0}</strong> | Passed filters:{" "}
        <strong>{diagnostics.passedFilterCount ?? 0}</strong> | Saved:{" "}
        <strong>{diagnostics.savedUniqueCount ?? diagnostics.syncedCount ?? 0}</strong>
      </p>
    );
  }

  function formatAuditPercent(value: number | null | undefined) {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(1)}%`;
  }

  function formatAuditDecimal(value: number | null | undefined) {
    if (value === null || value === undefined) return "N/A";
    return value.toFixed(1);
  }

  function getTeamNearMissStatus(row: MlbTeamAuditRow) {
    if (row.currentTopEligible || row.currentBestValueEligible) return "Eligible but cut";
    return "Blocked";
  }

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="app-card mb-6 grid gap-6 rounded-[2rem] p-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="app-eyebrow mb-3">Baseball model board</div>
          <h1 className="mb-2 text-4xl font-semibold text-slate-950">MLB Dashboard</h1>
          <p className="text-slate-600">
            Team-based MLB slate model for moneyline, run line, totals, and lineup-aware player props.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Team picks aim for the best blend of hit rate and decent payout, with stars tied more closely to whether the projection actually supports the side.
          </p>
          {day === "today" && resolvedOdds.usedTomorrowFallback && (
            <p className="mt-2 text-sm text-amber-700">
              Loaded the preloaded slate because it already matched today&apos;s betting day.
            </p>
          )}
          {resolvedOdds.isStale && !cachedOdds && (
            <p className="mt-2 text-sm text-rose-700">
              No fresh MLB slate is cached for {resolvedOdds.expectedBusinessDate}. The last cached betting day was{" "}
              <strong>{staleBusinessDate ?? "unknown"}</strong>, so the board will stay empty until MLB odds sync succeeds.
            </p>
          )}
        </div>

        <div className="grid gap-3 self-start sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Betting day</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              {boardDate}
            </div>
            <p className="mt-1 text-sm text-slate-600">Rolls over at 5:00 AM ET.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Board view</div>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/mlb?day=today`}
                className={`app-pill rounded-full px-4 py-2 ${
                  day === "today" ? "app-pill-active" : "text-slate-800"
                }`}
              >
                Today
              </Link>
              <Link
                href={`/mlb?day=yesterday`}
                className={`app-pill rounded-full px-4 py-2 ${
                  day === "yesterday" ? "app-pill-active" : "text-slate-800"
                }`}
              >
                Yesterday
              </Link>
            </div>
          </div>
        </div>
      </div>

      <FoldPanel
        eyebrow="Sync controls"
        title="Refresh MLB board"
        summary="Sync odds for team picks, sync props for the full slate, rebuild team boards, or grade finished picks."
        badge={
          <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
            Manual syncs today: {manualUsage?.count ?? 0}
          </div>
        }
        defaultOpen={false}
        className="mb-6"
      >
        {isOwner ? (
          day === "today" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SyncButton
                label="Sync MLB Odds"
                endpoint={`/api/sync-mlb-odds?day=${day}`}
                description="Refreshes the full team slate and rebuilds team top picks + best value."
              />
              <SyncButton
                label="Rebuild Team Picks"
                endpoint={`/api/sync-mlb-top-picks?day=${day}`}
                description="Re-runs top team picks and best value from the cached MLB odds."
              />
              <SyncButton
                label="Sync MLB Props"
                endpoint={`/api/sync-mlb-props-slate?day=${day}`}
                description="Refreshes props for the whole slate and rebuilds prop top picks + best value."
              />
              <SyncButton label="Grade Results" endpoint="/api/grade-picks" description="Grades settled picks without changing frozen board history." />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 text-sm text-slate-600">
                Yesterday is saved board history for {boardDate}. Switch to Today to sync a live MLB slate.
              </div>
              <SyncButton label="Grade Results" endpoint="/api/grade-picks" description="Grades settled picks without changing frozen board history." />
            </div>
          )
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-4 text-sm text-slate-600">
            <p>Owner login is needed before sync buttons can run.</p>
            <Link href="/login" className="app-button app-button-primary inline-flex items-center justify-center">
              Log in to sync
            </Link>
          </div>
        )}
      </FoldPanel>

      {!cachedOdds && !hasSavedBoardPicks ? (
        <div className="app-panel rounded-3xl p-5">
          {day === "yesterday" ? (
            <>
              No saved MLB picks for yesterday&apos;s betting day <strong>{boardDate}</strong> yet.
            </>
          ) : (
            <>
              No cached MLB odds for betting day <strong>{boardDate}</strong> yet. Use{" "}
              <strong>Sync MLB Odds</strong> above to load tonight&apos;s slate.
            </>
          )}
        </div>
      ) : (
        <>
          <section className="app-card rounded-[2rem] p-6 mb-8">
            {propMarketHealthRows.length > 0 && (
              <FoldPanel
                eyebrow="Model health"
                title="Player prop learning guardrails"
                summary="These update from graded results and can lower prop stars or keep a cold market out of Free Picks."
                badge={
                  <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                    Outliers and extra innings are discounted
                  </div>
                }
                defaultOpen={false}
                className="mb-6"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  {propMarketHealthRows.map((health) => (
                    <div key={health.marketType} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      <div className="font-semibold text-slate-950">{formatPropMarketLabel(health.marketType)}</div>
                      <p>
                        Overall: {health.sampleSize} graded, {health.winRate}% hit, {formatHealthUnits(health.netUnits)}
                      </p>
                      <p>
                        Recent: {health.recentSampleSize} graded, {health.recentWinRate}% hit,{" "}
                        {formatHealthUnits(health.recentNetUnits)}
                      </p>
                      <p>
                        Guardrail: max {health.maxStars} Stars, {health.lockEligible ? "Free Picks eligible" : "not Free Picks eligible"}
                      </p>
                      {health.warning && <p className="text-slate-500">Note: {health.warning}</p>}
                    </div>
                  ))}
                </div>
              </FoldPanel>
            )}

            <FoldPanel
              eyebrow="Future audit replay"
              title="Current board diagnostics"
              summary="Near misses, blocked prop profiles, and team moneyline / total sanity checks from this board's full menu."
              badge={
                <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
                  Preferred props on board: {propPreferredSelectedCount}/{propPreferredAuditRows.length}
                </div>
              }
              defaultOpen={false}
              className="mb-6"
            >
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">MLB prop diagnostics</h3>
                        <p className="text-sm text-slate-600">What the full prop menu looked like before the board narrowed it down.</p>
                      </div>
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                        Blocked preferred props: {propBlockedAuditRows.length}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-5">
                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-3 text-sm text-slate-700">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Offered</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950">{propDiagnosticsTotals.offered}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-3 text-sm text-slate-700">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Roster matched</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950">{propDiagnosticsTotals.rosterMatched}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-3 text-sm text-slate-700">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Projected</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950">{propDiagnosticsTotals.projected}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-3 text-sm text-slate-700">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Passed filters</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950">{propDiagnosticsTotals.passed}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-3 text-sm text-slate-700">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Saved</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950">{propDiagnosticsTotals.saved}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">Closest prop near-misses</h3>
                        <p className="text-sm text-slate-600">Preferred sides that survived the filters but still got crowded off the featured board.</p>
                      </div>
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                        {propEligibleNearMissRows.length} shown
                      </div>
                    </div>
                    {propEligibleNearMissRows.length === 0 ? (
                      <p className="text-sm text-slate-600">No prop near-misses right now. The board either took the preferred side or filtered it out earlier.</p>
                    ) : (
                      <div className="grid gap-3">
                        {propEligibleNearMissRows.map((row) => (
                          <div key={`${row.externalEventId}-${row.playerName}-${row.side}`} className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div>
                                <div className="font-semibold text-slate-950">{row.playerName} - {row.playerTeamShort}</div>
                                <div className="text-xs text-slate-500">{row.gameLabel} | {formatPropMarketLabel(row.marketType)}</div>
                              </div>
                              <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                {formatCardStartTime(row.commenceTime)}
                              </div>
                            </div>
                            <p><strong>Side:</strong> {row.side} @ {row.oddsTaken ?? "N/A"}</p>
                            <p><strong>Top score:</strong> {formatAuditDecimal(row.topPickScore)} | <strong>Clear rate:</strong> {formatAuditPercent(row.lineClearProbability)}</p>
                            <p><strong>Recent / season:</strong> {formatAuditPercent(row.recentLineClearRate)} / {formatAuditPercent(row.seasonLineClearRate)}</p>
                            {row.marketHealthNote ? <p><strong>Learning:</strong> {row.marketHealthNote}</p> : null}
                            {(row.reasonLabels ?? []).length > 0 ? <p><strong>Why it stayed alive:</strong> {(row.reasonLabels ?? []).join(", ")}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">Blocked prop patterns</h3>
                        <p className="text-sm text-slate-600">The most common reasons the preferred side still got kept off the board.</p>
                      </div>
                    </div>
                    {propBlockedReasonCounts.length === 0 ? (
                      <p className="text-sm text-slate-600">No blocked preferred prop patterns saved right now.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {propBlockedReasonCounts.map((item) => (
                          <div key={item.label} className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700">
                            {item.label} <span className="text-slate-500">x{item.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">Team board sanity check</h3>
                        <p className="text-sm text-slate-600">Moneylines and totals the model liked but still left off the featured team board.</p>
                      </div>
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                        On board: {teamPreferredSelectedCount}/{teamPreferredMlTotalRows.length}
                      </div>
                    </div>
                    {teamNearMissRows.length === 0 ? (
                      <p className="text-sm text-slate-600">No moneyline or total near-misses saved right now. The board either used the preferred side or the model stayed spread-first.</p>
                    ) : (
                      <div className="grid gap-3">
                        {teamNearMissRows.map((row) => (
                          <div key={`${row.gameId}-${row.marketType}-${row.side}`} className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div>
                                <div className="font-semibold text-slate-950">{row.gameLabel}</div>
                                <div className="text-xs text-slate-500">{row.marketType === "moneyline" ? "Moneyline" : "Total"} | {getTeamNearMissStatus(row)}</div>
                              </div>
                              <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                {formatCardStartTime(row.commenceTime)}
                              </div>
                            </div>
                            <p><strong>Side:</strong> {row.side}</p>
                            <p><strong>Top / value score:</strong> {formatAuditDecimal(row.topPickScore)} / {formatAuditDecimal(row.bestValueScore)}</p>
                            <p><strong>Signal:</strong> {row.edgeLabel ?? row.signal ?? "N/A"}</p>
                            {(row.reasonLabels ?? []).length > 0 ? <p><strong>Why it was close:</strong> {(row.reasonLabels ?? []).join(", ")}</p> : null}
                            {(row.riskFlags ?? []).length > 0 ? <p><strong>What held it back:</strong> {(row.riskFlags ?? []).join(", ")}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {teamBlockedReasonCounts.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {teamBlockedReasonCounts.map((item) => (
                          <div key={item.label} className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700">
                            {item.label} <span className="text-slate-500">x{item.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </FoldPanel>

          </section>

          <AllSportsFreePicksBoard pickDate={boardDate} />

          <section className="app-card rounded-[2rem] p-6 mb-8">
            <div className="mobile-pick-board-grid grid grid-cols-2 gap-3 lg:gap-6 mb-5">
              <div>
                <div className="inline-flex items-center rounded-full border border-emerald-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-emerald-900 mb-3">
                  Built to cash more often
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Top Picks</h2>
                <p className="text-slate-600">
                  These now lean toward stronger hit-rate profiles: high-confidence picks with better chances to cash and still reasonable payout.
                </p>
              </div>
              <div>
                <div className="inline-flex items-center rounded-full border border-sky-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-sky-900 mb-3">
                  Bigger pricing mistakes
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Best Value</h2>
                <p className="text-slate-600">
                  These are the strongest raw value spots, even if they are a little swingier than the main top-pick board.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {Array.from({ length: getBoardRowCount(teamTopPicks.length, teamBestValuePicks.length) }).map((_, index) => (
                <div key={`team-board-row-${index}`} className="mobile-pick-board-grid grid grid-cols-2 items-stretch gap-3 lg:gap-6">
                  {teamTopPicks[index]
                    ? renderSavedTeamCard(teamTopPicks[index], "Top Pick", index + 1)
                    : renderEmptyBoardCell("No saved top team pick for this slot.")}
                  {teamBestValuePicks[index]
                    ? renderSavedTeamCard(teamBestValuePicks[index], "Value Pick", index + 1)
                    : renderEmptyBoardCell("No saved team value pick for this slot.")}
                </div>
              ))}
            </div>
          </section>

          <section className="app-card rounded-[2rem] p-6 mb-8">
            <div className="mobile-pick-board-grid grid grid-cols-2 gap-3 lg:gap-6 mb-5">
              <div>
                <div className="inline-flex items-center rounded-full border border-violet-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-violet-900 mb-3">
                  Player props leaning safer
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Prop Top Picks</h2>
                <p className="text-slate-600">
                  Pregame prop board built to cash more often, not just chase the biggest payout.
                </p>
              </div>
              <div>
                <div className="inline-flex items-center rounded-full border border-amber-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-amber-900 mb-3">
                  Bigger player prop price gaps
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Prop Best Value</h2>
                <p className="text-slate-600">
                  These are the strongest raw prop value spots, even if they are a little swingier than the main prop board.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {Array.from({ length: getBoardRowCount(propTopPicks.length, propBestValuePicks.length) }).map((_, index) => (
                <div key={`prop-board-row-${index}`} className="mobile-pick-board-grid grid grid-cols-2 items-stretch gap-3 lg:gap-6">
                  {propTopPicks[index]
                    ? renderPropCard(propTopPicks[index], "Prop Top Pick", index + 1)
                    : renderEmptyBoardCell("No synced prop top pick for this slot.")}
                  {propBestValuePicks[index]
                    ? renderPropCard(propBestValuePicks[index], "Prop Value", index + 1)
                    : renderEmptyBoardCell("No prop value pick saved for this slot.")}
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-4">
            {displaySlateGames.length === 0 ? (
              <div className="app-panel rounded-3xl p-5">
                No active MLB games left on this slate. Saved top picks and best value stay above for the betting day.
              </div>
            ) : displaySlateGames.map((item: EvaluatedMlbGame) => {
              const gameLabel = `${item.game.away_team} @ ${item.game.home_team}`;
              const scheduleStatus = resolveScheduleStatusInfo({
                gamePk: item.context?.gamePk ?? null,
                gameLabel,
                gameStartTime: item.game.commence_time,
              });
              const startState = getSavedPickStartState(item.game.commence_time, scheduleStatus);
              const hasStarted = startState.started;
              const startedMoneyline = hasStarted ? getStartedTeamSnapshot(item, "moneyline") : null;
              const startedRunLine = hasStarted ? getStartedTeamSnapshot(item, "spread") : null;
              const startedTotal = hasStarted ? getStartedTeamSnapshot(item, "total") : null;

              return (
              <CollapsibleGameCard
                key={item.game.id}
                title={`${item.game.away_team} @ ${item.game.home_team}`}
                subtitle={new Date(item.game.commence_time).toLocaleString()}
                badges={
                  <div className={`rounded-full border px-3 py-1 text-sm font-medium ${startState.pillClass}`}>
                    {startState.pillLabel}
                  </div>
                }
                controls={
                  isOwner && day === "today" ? (
                    <>
                      {!hasStarted ? (
                        <>
                          <SyncButton
                            label="Sync This Game"
                            endpoint={`/api/sync-mlb-game?day=${day}&eventId=${item.game.id}`}
                            description="Refresh just this matchup without re-running the whole slate."
                          />
                          <SyncButton
                            label="Sync Props"
                            endpoint={`/api/sync-mlb-props?day=${day}&eventId=${item.game.id}`}
                            description="Pull pitcher strikeouts, batter hits, and total bases for this game."
                          />
                        </>
                      ) : (
                        <div className="text-sm text-slate-500">
                          Sync locked after first pitch
                        </div>
                      )}
                    </>
                  ) : null
                }
                summary={
                  item.missingModel ? (
                    <div className="text-red-700">
                      Missing MLB ratings for one of these teams, so this game cannot be modeled yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Moneyline</h3>
                          <div className="text-slate-700">
                            <strong>Market:</strong>{" "}
                            {hasStarted
                              ? getStartedMarketDisplay(
                                  startedMoneyline,
                                  `${item.game.home_team} ${item.marketHomeMoneyline} / ${item.game.away_team} ${item.marketAwayMoneyline}`
                                )
                              : `${item.game.home_team} ${item.marketHomeMoneyline} / ${item.game.away_team} ${item.marketAwayMoneyline}`}
                          </div>
                          <div className="text-slate-700">
                            <strong>Fair:</strong> {item.game.home_team} {item.fairHomeMoneyline} /{" "}
                            {item.game.away_team} {item.fairAwayMoneyline}
                          </div>
                          <div className="text-slate-700">
                            <strong>Home win %:</strong>{" "}
                            {item.homeWinProb === undefined ? "N/A" : `${(item.homeWinProb * 100).toFixed(1)}%`}
                          </div>
                          <div className="text-slate-700">
                            <strong>Current odds:</strong>{" "}
                            {hasStarted ? startedMoneyline?.odds_taken ?? (item.moneylineSignal?.includes("Home")
                              ? item.marketHomeMoneyline
                              : item.marketAwayMoneyline) : item.moneylineSignal?.includes("Home")
                              ? item.marketHomeMoneyline
                              : item.marketAwayMoneyline}
                          </div>
                          <div className="text-slate-700">
                            <strong>Potential payout:</strong>{" "}
                            {formatPotentialPayout(
                              hasStarted
                                ? startedMoneyline?.odds_taken ?? (item.moneylineSignal?.includes("Home")
                                  ? item.marketHomeMoneyline
                                  : item.marketAwayMoneyline)
                                : item.moneylineSignal?.includes("Home")
                                  ? item.marketHomeMoneyline
                                  : item.marketAwayMoneyline
                            )}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedMoneyline?.edge_label : item.moneylineSignal) ?? "")}>
                            <strong>Signal:</strong> {hasStarted ? startedMoneyline?.side ?? getMoneylineSignalDisplay(item) : getMoneylineSignalDisplay(item)}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedMoneyline?.edge_label : item.moneylineSignal) ?? "")}>
                            <strong>Edge:</strong> {formatEdge(hasStarted ? startedMoneyline?.edge ?? item.moneylineEdgePercent : item.moneylineEdgePercent, "moneyline")}
                          </div>
                          <div className="text-slate-700">
                            <strong>Confidence:</strong>{" "}
                            {getConfidenceLabel(
                              getConfidenceStars({
                                sport: "MLB",
                                marketType: "moneyline",
                                edge: hasStarted ? startedMoneyline?.edge ?? item.moneylineEdgePercent : item.moneylineEdgePercent,
                                confidenceScore: hasStarted ? startedMoneyline?.confidence_score : undefined,
                                projectedSideMargin: hasStarted
                                  ? startedMoneyline && startedMoneyline.projected_home_score !== null && startedMoneyline.projected_home_score !== undefined &&
                                    startedMoneyline.projected_away_score !== null && startedMoneyline.projected_away_score !== undefined
                                      ? (startedMoneyline.side === item.game.home_team
                                          ? startedMoneyline.projected_home_score - startedMoneyline.projected_away_score
                                          : startedMoneyline.projected_away_score - startedMoneyline.projected_home_score)
                                      : undefined
                                  : item.moneylineSignal?.includes("Home")
                                    ? item.projectedMargin
                                    : (item.projectedMargin ?? 0) * -1,
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Run Line</h3>
                          <div className="text-slate-700">
                            <strong>Market:</strong>{" "}
                            {hasStarted
                              ? getStartedMarketDisplay(
                                  startedRunLine,
                                  `${item.game.home_team} ${formatSignedValue(item.marketHomeRunLine)} (${item.homeRunLinePrice}) / ${item.game.away_team} ${formatSignedValue(item.marketAwayRunLine)} (${item.awayRunLinePrice})`
                                )
                              : `${item.game.home_team} ${formatSignedValue(item.marketHomeRunLine)} (${item.homeRunLinePrice}) / ${item.game.away_team} ${formatSignedValue(item.marketAwayRunLine)} (${item.awayRunLinePrice})`}
                          </div>
                          <div className="text-slate-700">
                            <strong>Projected margin:</strong> {item.projectedMargin}
                          </div>
                          <div className="text-slate-700">
                            <strong>Current odds:</strong>{" "}
                            {hasStarted ? startedRunLine?.odds_taken ?? (item.runLineSignal?.includes("Home")
                              ? item.homeRunLinePrice
                              : item.awayRunLinePrice) : item.runLineSignal?.includes("Home")
                              ? item.homeRunLinePrice
                              : item.awayRunLinePrice}
                          </div>
                          <div className="text-slate-700">
                            <strong>Potential payout:</strong>{" "}
                            {formatPotentialPayout(
                              hasStarted
                                ? startedRunLine?.odds_taken ?? (item.runLineSignal?.includes("Home")
                                  ? item.homeRunLinePrice
                                  : item.awayRunLinePrice)
                                : item.runLineSignal?.includes("Home")
                                  ? item.homeRunLinePrice
                                  : item.awayRunLinePrice
                            )}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedRunLine?.edge_label : item.runLineSignal) ?? "")}>
                            <strong>Signal:</strong> {hasStarted ? startedRunLine?.side ?? getRunLineSignalDisplay(item) : getRunLineSignalDisplay(item)}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedRunLine?.edge_label : item.runLineSignal) ?? "")}>
                            <strong>Edge:</strong> {formatEdge(hasStarted ? startedRunLine?.edge ?? item.runLineEdge : item.runLineEdge, "spread")}
                          </div>
                          <div className="text-slate-700">
                            <strong>Confidence:</strong>{" "}
                            {getConfidenceLabel(
                              getConfidenceStars({
                                sport: "MLB",
                                marketType: "spread",
                                edge: hasStarted ? startedRunLine?.edge ?? item.runLineEdge : item.runLineEdge,
                                confidenceScore: hasStarted ? startedRunLine?.confidence_score : undefined,
                                coverBuffer: hasStarted
                                  ? startedRunLine?.cover_buffer ?? (item.runLineSignal?.includes("Home")
                                    ? ((item.projectedMargin ?? 0) + (item.marketHomeRunLine ?? 0))
                                    : (((item.projectedMargin ?? 0) * -1) + (item.marketAwayRunLine ?? 0)))
                                  : item.runLineSignal?.includes("Home")
                                    ? ((item.projectedMargin ?? 0) + (item.marketHomeRunLine ?? 0))
                                    : (((item.projectedMargin ?? 0) * -1) + (item.marketAwayRunLine ?? 0)),
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Total</h3>
                          <div className="text-slate-700">
                            <strong>Market total:</strong>{" "}
                            {hasStarted
                              ? getStartedMarketDisplay(
                                  startedTotal,
                                  `${item.marketTotal} (Over ${item.overPrice} / Under ${item.underPrice})`
                                )
                              : `${item.marketTotal} (Over ${item.overPrice} / Under ${item.underPrice})`}
                          </div>
                          <div className="text-slate-700">
                            <strong>Projected total:</strong> {item.projectedTotal}
                          </div>
                          <div className="text-slate-700">
                            <strong>Current odds:</strong>{" "}
                            {hasStarted ? startedTotal?.odds_taken ?? (item.totalSignal?.includes("Over") ? item.overPrice : item.underPrice) : item.totalSignal?.includes("Over") ? item.overPrice : item.underPrice}
                          </div>
                          <div className="text-slate-700">
                            <strong>Potential payout:</strong>{" "}
                            {formatPotentialPayout(
                              hasStarted
                                ? startedTotal?.odds_taken ?? (item.totalSignal?.includes("Over")
                                  ? item.overPrice
                                  : item.underPrice)
                                : item.totalSignal?.includes("Over")
                                  ? item.overPrice
                                  : item.underPrice
                            )}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedTotal?.edge_label : item.totalSignal) ?? "")}>
                            <strong>Signal:</strong> {hasStarted ? startedTotal?.side ?? getTotalSignalDisplay(item) : getTotalSignalDisplay(item)}
                          </div>
                          <div className={getSignalColor((hasStarted ? startedTotal?.edge_label : item.totalSignal) ?? "")}>
                            <strong>Edge:</strong> {formatEdge(hasStarted ? startedTotal?.edge ?? item.totalEdge : item.totalEdge, "total")}
                          </div>
                          <div className="text-slate-700">
                            <strong>Confidence:</strong>{" "}
                            {getConfidenceLabel(
                              getConfidenceStars({
                                sport: "MLB",
                                marketType: "total",
                                edge: hasStarted ? startedTotal?.edge ?? item.totalEdge : item.totalEdge,
                                confidenceScore: hasStarted ? startedTotal?.confidence_score : undefined,
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                        <strong>Projected score:</strong> {item.game.away_team}{" "}
                        {hasStarted ? startedMoneyline?.projected_away_score ?? item.projectedAwayRuns : item.projectedAwayRuns} -{" "}
                        {item.game.home_team}{" "}
                        {hasStarted ? startedMoneyline?.projected_home_score ?? item.projectedHomeRuns : item.projectedHomeRuns}
                      </div>
                    </div>
                  )
                }
                details={
                  !item.missingModel ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-700">
                        <h4 className="font-semibold text-slate-900 mb-2">Starter Context</h4>
                        {renderStarterSummary(item)}
                      </div>
                      <div className="rounded-2xl bg-white/72 px-4 py-3">
                        <h4 className="font-semibold text-slate-900 mb-2">Roster / Injury Notes</h4>
                        {renderInjurySummary(item)}
                      </div>
                      {(item.homeAdjustmentNote || item.awayAdjustmentNote || cachedOdds?.learning) && (
                        <div className="rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-700">
                          <h4 className="font-semibold text-slate-900 mb-2">Learning Adjustments</h4>
                          {item.awayAdjustmentNote && (
                            <p>
                              <strong>{item.game.away_team}:</strong> {item.awayAdjustmentNote}
                            </p>
                          )}
                          {item.homeAdjustmentNote && (
                            <p>
                              <strong>{item.game.home_team}:</strong> {item.homeAdjustmentNote}
                            </p>
                          )}
                          {cachedOdds?.learning && (
                            <p className="mt-2 text-slate-500">
                              Global bias: total {cachedOdds.learning.globalTotalBiasRuns > 0 ? "+" : ""}
                              {cachedOdds.learning.globalTotalBiasRuns.toFixed(2)} runs, home field{" "}
                              {cachedOdds.learning.globalHomeFieldBiasRuns > 0 ? "+" : ""}
                              {cachedOdds.learning.globalHomeFieldBiasRuns.toFixed(2)} runs.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="rounded-2xl bg-white/72 px-4 py-3">
                        <h4 className="font-semibold text-slate-900 mb-2">Synced Props For This Game</h4>
                        {renderPropDiagnostics(item.game.id)}
                        {(propPicksByEvent.get(item.game.id) ?? []).length === 0 ? (
                          <p className="text-sm text-slate-600 mt-2">
                            No player props synced for this matchup yet. Use <strong>Sync Props</strong> above before first pitch.
                          </p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 mt-3">
                            {(propPicksByEvent.get(item.game.id) ?? []).map((prop) => {
                              const { displayName, teamTag } = splitTaggedPlayerName(prop.player_name);
                              const propLabelParts = splitEdgeLabel(prop.edge_label);

                              return (
                                <div key={prop.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="font-semibold text-slate-900">
                                      {displayName}
                                      {teamTag ? ` - ${teamTag}` : ""}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                      <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                        {formatCardStartTime(prop.game_start_time ?? null)} ET
                                      </div>
                                      <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700">
                                        {getConfidenceLabel(
                                          getConfidenceStars({
                                            sport: "MLB",
                                            marketType: prop.market_type,
                                            edge: prop.edge,
                                            confidenceScore: prop.confidence_score,
                                            gameStartTime: prop.game_start_time,
                                          })
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <p>
                                    <strong>Prop:</strong> {formatPropMarketLabel(prop.market_type)}
                                  </p>
                                  <p>
                                    <strong>Pick:</strong> {prop.side}
                                  </p>
                                  <p>
                                    <strong>Projected vs line:</strong> {prop.projected_line ?? "N/A"} vs{" "}
                                    {prop.market_line ?? prop.line_taken ?? "N/A"}
                                  </p>
                                  {prop.market_type === "pitcher_strikeouts" &&
                                    extractProjectedPitcherInnings(prop.edge_label) !== null && (
                                    <p>
                                      <strong>Projected IP:</strong>{" "}
                                      {extractProjectedPitcherInnings(prop.edge_label)?.toFixed(1)}
                                    </p>
                                  )}
                                  {prop.market_type === "pitcher_strikeouts" && propLabelParts.context && (
                                    <p>
                                      <strong>Pitch model:</strong> {propLabelParts.context}
                                    </p>
                                  )}
                                  <p>
                                    <strong>Odds:</strong> {prop.odds_taken ?? "N/A"} | <strong>Payout:</strong>{" "}
                                    {formatPotentialPayout(prop.odds_taken)}
                                  </p>
                                  <p>
                                    <strong>Signal:</strong> {prop.edge_label ?? "N/A"}
                                  </p>
                                  <p>
                                    <strong>Edge:</strong> {prop.edge ?? "N/A"}
                                  </p>
                                  <p>
                                    <strong>Tags:</strong>{" "}
                                    {[
                                      prop.is_top_pick ? `Top Pick #${prop.top_pick_rank}` : null,
                                      prop.notes === "best_value" ? "Best Value" : null,
                                      prop.locked_at ? "Locked" : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" | ") || "Standard"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : undefined
                }
              />
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
