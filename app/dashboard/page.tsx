import Link from "next/link";
import AllSportsFreePicksBoard from "@/app/components/AllSportsFreePicksBoard";
import CollapsibleGameCard from "@/app/components/CollapsibleGameCard";
import FoldPanel from "@/app/components/FoldPanel";
import ResponsivePickDetails from "@/app/components/ResponsivePickDetails";
import SyncButton from "./SyncButton";
import { getCachedData } from "@/lib/cache";
import {
  getNbaPropAuditSnapshot,
  type NbaPropAuditRow,
} from "@/lib/futureAudit";
import {
  getResolvedNbaPropsCache,
  getResolvedNbaTeamOddsCache,
  type NbaOddsCacheDay,
  type NbaPropMarketType,
} from "@/lib/nbaOddsCache";
import type { NbaInjurySyncData } from "@/lib/nbaInjuries";
import { buildNbaLearningProfile } from "@/lib/nbaLearning";
import {
  buildNbaPropLearningProfile,
  buildNbaPropTopScore,
  buildNbaPropValueScore,
  type NbaPropLearningProfile,
} from "@/lib/nbaPropLearning";
import { getPickStatusLabel, resolvePickStatus } from "@/lib/pickStatus";
import { hasNbaTeamFreePickRiskCap } from "@/lib/nbaFreePickRisk";
import {
  buildUniqueNbaPropPool,
  getNbaPropConflictKey,
  selectUniqueNbaPropRows,
} from "@/lib/nbaPropSelection";
import {
  americanToImpliedProb,
  evaluateTeamGames,
  getNbaTeamBestValueScore,
  getNbaTeamTopPickScore,
} from "@/lib/teamModel";
import { NBA_PROP_TYPES, PROP_MARKET_MAP, isNbaPropType } from "@/lib/propModel";
import { getConfidenceLabel, getPickConfidenceStars } from "@/lib/starRatings";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { americanToProfitPerUnit } from "@/lib/units";
import { getManualSyncUsage, isOwnerLoggedIn } from "@/lib/ownerAuth";
import { getServerRequestOrigin } from "@/lib/requestOrigin";

type SavedNbaTeamPick = {
  id: number;
  created_at?: string | null;
  sport?: string | null;
  game_label: string;
  game_start_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  stake_units?: number | null;
  confidence_score?: number | null;
  projected_line?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  status?: string | null;
  final_score?: string | null;
  units_result?: number | null;
  notes?: string | null;
};

type SavedNbaPropPick = {
  id: number;
  created_at?: string | null;
  locked_at?: string | null;
  game_label: string;
  game_start_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  market_type?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  stake_units?: number | null;
  confidence_score?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  units_result?: number | null;
  notes?: string | null;
};

type CachedPropRow = {
  external_event_id?: string | null;
  commence_time?: string | null;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  line?: number | null;
  over_odds?: number | null;
  under_odds?: number | null;
  prop_type?: string | null;
  official_side?: string | null;
  official_odds?: number | null;
  market_score?: number | null;
  signal?: string | null;
};

type NbaPropInjuryAction = NbaInjurySyncData["propActions"][number];
type NbaTeamInjuryAction = NbaInjurySyncData["teamActions"][number];

type BoardSlot<T, A> = {
  slotNumber: number;
  original: T;
  originalAction: A | null;
  isVoided: boolean;
  isRestored: boolean;
  isPreservedOriginal: boolean;
  replacement: T | null;
  replacementAction: A | null;
};

const PROP_TYPES = NBA_PROP_TYPES;
type PropMarketType = (typeof PROP_TYPES)[number];
const NBA_TEAM_PICK_SELECT = [
  "id",
  "created_at",
  "sport",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "market_type",
  "side",
  "line_taken",
  "odds_taken",
  "stake_units",
  "confidence_score",
  "projected_line",
  "projected_home_score",
  "projected_away_score",
  "market_line",
  "edge",
  "edge_label",
  "is_top_pick",
  "top_pick_rank",
  "status",
  "final_score",
  "units_result",
  "notes",
].join(",");
const NBA_PROP_PICK_SELECT = [
  "id",
  "created_at",
  "locked_at",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "player_name",
  "market_type",
  "side",
  "line_taken",
  "odds_taken",
  "stake_units",
  "confidence_score",
  "market_line",
  "edge",
  "edge_label",
  "is_top_pick",
  "top_pick_rank",
  "status",
  "final_score",
  "final_stat",
  "units_result",
  "notes",
].join(",");

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function formatSpread(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatProjectedScore(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined
) {
  if (
    !homeTeam ||
    !awayTeam ||
    homeScore === null ||
    homeScore === undefined ||
    awayScore === null ||
    awayScore === undefined
  ) {
    return "Projection unavailable";
  }

  return `${awayTeam} ${awayScore} - ${homeTeam} ${homeScore}`;
}

function formatPotentialPayout(odds: number | null | undefined) {
  if (odds === null || odds === undefined) return "N/A";
  return `${americanToProfitPerUnit(odds).toFixed(2)}u`;
}

function formatAmericanOdds(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return value > 0 ? `+${value}` : `${value}`;
}

function getTeamMarketLabel(marketType: string | null | undefined) {
  if (marketType === "moneyline") return "Moneyline";
  if (marketType === "total") return "Total";
  return "Team Spread";
}

function getSavedTeamTopScore(
  row: Pick<SavedNbaTeamPick, "market_type" | "edge" | "confidence_score" | "odds_taken">
) {
  return getNbaTeamTopPickScore({
    marketType: (row.market_type as "moneyline" | "spread" | "total" | null) ?? "spread",
    edge: row.edge ?? null,
    confidenceScore: row.confidence_score ?? null,
    oddsTaken: row.odds_taken ?? null,
  });
}

function getSavedTeamValueScore(
  row: Pick<SavedNbaTeamPick, "market_type" | "edge" | "confidence_score" | "odds_taken">
) {
  return getNbaTeamBestValueScore({
    marketType: (row.market_type as "moneyline" | "spread" | "total" | null) ?? "spread",
    edge: row.edge ?? null,
    confidenceScore: row.confidence_score ?? null,
    oddsTaken: row.odds_taken ?? null,
  });
}

function getSavedPropValueScore(row: Pick<SavedNbaPropPick, "confidence_score" | "odds_taken">) {
  return Number((row.confidence_score ?? 0).toFixed(1));
}

function getSavedPropTopScore(row: Pick<SavedNbaPropPick, "confidence_score" | "odds_taken">) {
  return Number((row.confidence_score ?? 0).toFixed(1));
}

function getPropMarketLabel(marketType: string | null | undefined) {
  return isNbaPropType(marketType) ? PROP_MARKET_MAP[marketType].label : String(marketType ?? "Prop");
}

function getCachedPropTopScore(
  prop: Pick<CachedPropRow, "prop_type" | "official_side" | "official_odds" | "market_score">,
  profile: NbaPropLearningProfile | null | undefined
) {
  return buildNbaPropTopScore(
    {
      marketType: prop.prop_type,
      side: prop.official_side,
      oddsTaken: prop.official_odds ?? null,
      marketScore: prop.market_score ?? null,
    },
    profile
  );
}

function getCachedPropValueScore(
  prop: Pick<CachedPropRow, "prop_type" | "official_side" | "official_odds" | "market_score">,
  profile: NbaPropLearningProfile | null | undefined
) {
  return buildNbaPropValueScore(
    {
      marketType: prop.prop_type,
      side: prop.official_side,
      oddsTaken: prop.official_odds ?? null,
      marketScore: prop.market_score ?? null,
    },
    profile
  );
}

function getCachedPropDisplayScore(
  prop: Pick<CachedPropRow, "prop_type" | "official_side" | "official_odds" | "market_score">,
  profile: NbaPropLearningProfile | null | undefined
) {
  return Math.max(getCachedPropTopScore(prop, profile), getCachedPropValueScore(prop, profile));
}

function getCachedPropStars(
  prop: Pick<CachedPropRow, "prop_type" | "official_side" | "official_odds" | "market_score">,
  profile: NbaPropLearningProfile | null | undefined
) {
  return getPickConfidenceStars({
    sport: "NBA",
    market_type: prop.prop_type,
    confidence_score: getCachedPropDisplayScore(prop, profile),
  });
}

function getSavedTeamDisplayStars(pick: SavedNbaTeamPick, action?: NbaTeamInjuryAction | null) {
  const baseStars = getPickConfidenceStars({
    ...pick,
    sport: "NBA",
  });

  if (baseStars >= 5 && hasNbaTeamFreePickRiskCap(pick, action)) {
    return 4;
  }

  return baseStars;
}

function sortTopPropRows(rows: SavedNbaPropPick[]) {
  return [...rows].sort((a, b) => {
    const scoreDelta = getSavedPropTopScore(b) - getSavedPropTopScore(a);
    if (scoreDelta !== 0) return scoreDelta;

    const confidenceDelta = (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    return normalizeLookupValue(a.created_at).localeCompare(normalizeLookupValue(b.created_at));
  });
}

function sortValuePropRows(rows: SavedNbaPropPick[]) {
  return [...rows].sort((a, b) => {
    const scoreDelta = getSavedPropValueScore(b) - getSavedPropValueScore(a);
    if (scoreDelta !== 0) return scoreDelta;

    const confidenceDelta = (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;

    return normalizeLookupValue(a.created_at).localeCompare(normalizeLookupValue(b.created_at));
  });
}

function formatSignedNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function formatDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(1);
}

function formatCardTime(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";

  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + " ET"
  );
}

function formatCheckedTime(value: string | null | undefined) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";

  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + " ET"
  );
}

function formatInjuryTriggerLabel(params: {
  reportLabel?: string | null;
  reportTimestamp?: string | null;
  fallbackLabel?: string | null;
}) {
  if (params.reportTimestamp) {
    const date = new Date(params.reportTimestamp);
    if (!Number.isNaN(date.getTime())) {
      const absoluteLabel =
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(date) + " ET";

      if (params.reportLabel) {
        return `${absoluteLabel} (${params.reportLabel} official report)`;
      }

      return absoluteLabel;
    }
  }

  if (params.reportLabel) {
    return `${params.reportLabel} official report`;
  }

  return params.fallbackLabel ?? "the injury update";
}

function formatNbaBoardRecheckLabel(board: string | null | undefined) {
  if (board === "team_top") return "Team Top";
  if (board === "team_value") return "Team Value";
  if (board === "prop_top") return "Prop Top";
  if (board === "prop_value") return "Prop Value";
  return "Board";
}

function formatNbaAvailabilityLabel(value: string | null | undefined) {
  if (value === "played") return "Played";
  if (value === "did_not_play") return "Did not play";
  if (value === "not_found") return "Not found";
  return "Unknown";
}

function getRecheckVerdictTone(value: string | null | undefined) {
  if (value === "replacement_better") return "bg-emerald-50 text-emerald-900";
  if (value === "original_better") return "bg-rose-50 text-rose-900";
  if (value === "same") return "bg-slate-50 text-slate-700";
  return "bg-amber-50 text-amber-900";
}

function getGameStateMeta(gameStartTime: string | null | undefined, status: string | null | undefined) {
  if (status === "voided") {
    if (!gameStartTime) {
      return {
        pillLabel: "Not started",
        detailLabel: "Not started",
        pillClass: "border-slate-200/80 bg-slate-50 text-slate-700",
      };
    }

    const start = new Date(gameStartTime);
    if (Number.isNaN(start.getTime()) || start.getTime() > Date.now()) {
      return {
        pillLabel: "Not started",
        detailLabel: "Not started",
        pillClass: "border-slate-200/80 bg-slate-50 text-slate-700",
      };
    }
  }

  const resolvedStatus = resolvePickStatus(status);

  if (resolvedStatus === "win" || resolvedStatus === "loss" || resolvedStatus === "push") {
    return {
      pillLabel: "Final",
      detailLabel: "Final",
      pillClass: "border-blue-200/80 bg-blue-50 text-blue-700",
    };
  }

  if (!gameStartTime) {
    return {
      pillLabel: "Not started",
      detailLabel: "Not started",
      pillClass: "border-slate-200/80 bg-slate-50 text-slate-700",
    };
  }

  const start = new Date(gameStartTime);
  if (Number.isNaN(start.getTime()) || start.getTime() > Date.now()) {
    return {
      pillLabel: "Not started",
      detailLabel: "Not started",
      pillClass: "border-slate-200/80 bg-slate-50 text-slate-700",
    };
  }

  return {
    pillLabel: "Started",
    detailLabel: "Started",
    pillClass: "border-blue-200/80 bg-blue-50 text-blue-700",
  };
}

function hasGameStarted(gameStartTime: string | null | undefined, status: string | null | undefined) {
  if (status === "voided") {
    if (!gameStartTime) {
      return false;
    }

    const start = new Date(gameStartTime);
    if (Number.isNaN(start.getTime())) {
      return false;
    }

    return start.getTime() <= Date.now();
  }

  const resolvedStatus = resolvePickStatus(status);
  if (resolvedStatus === "win" || resolvedStatus === "loss" || resolvedStatus === "push") {
    return true;
  }

  if (!gameStartTime) {
    return false;
  }

  const start = new Date(gameStartTime);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  return start.getTime() <= Date.now();
}

function getSignalColorClasses(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 8) return "text-emerald-700";
  if (value >= 4) return "text-teal-700";
  if (value >= 1.5) return "text-slate-700";
  return "text-slate-500";
}

function getBoardCardTone(status: string | null | undefined, injuryOverride?: "voided") {
  if (injuryOverride === "voided") {
    return "border-amber-200/80 bg-amber-50/80";
  }

  const resolvedStatus = resolvePickStatus(status);

  if (resolvedStatus === "win") {
    return "border-emerald-200/80 bg-emerald-50/70";
  }

  if (resolvedStatus === "loss") {
    return "border-rose-200/80 bg-rose-50/70";
  }

  if (resolvedStatus === "push") {
    return "border-amber-200/80 bg-amber-50/70";
  }

  return "border-slate-200/80 bg-white/78";
}

function buildSavedPropKey(row: SavedNbaPropPick) {
  return `${row.game_label}|${row.player_name ?? ""}|${row.side}|${row.line_taken ?? ""}`;
}

function buildCachedPropKey(row: CachedPropRow) {
  return `${row.game_label}|${row.player_name ?? ""}|${row.official_side ?? ""} ${row.line ?? ""}|${row.line ?? ""}`;
}

function buildInjuryPropKey(gameLabel: string | null | undefined, playerName: string | null | undefined) {
  return `${normalizeLookupValue(gameLabel)}|${normalizeLookupValue(playerName)}`;
}

function buildLegacyBoardMetaByPickId<T extends { id: number; created_at?: string | null }>(
  rows: T[],
  activeIds: Set<number>
) {
  const legacyRows = rows
    .filter((row) => !activeIds.has(row.id))
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });

  const legacyBoardMetaByPickId = new Map<number, { boardBucket: "top" | "value"; slotNumber: number }>();

  legacyRows.slice(0, 3).forEach((row, index) => {
    legacyBoardMetaByPickId.set(row.id, {
      boardBucket: "top",
      slotNumber: index + 1,
    });
  });

  legacyRows.slice(3, 6).forEach((row, index) => {
    legacyBoardMetaByPickId.set(row.id, {
      boardBucket: "value",
      slotNumber: index + 1,
    });
  });

  return legacyBoardMetaByPickId;
}

function buildBoardSlots<T extends { id: number }, A>(params: {
  primary: T[];
  pool: T[];
  isVoided: (pick: T) => boolean;
  getAction: (pick: T) => A | null;
  blockedIds?: Set<number>;
  claimedReplacementIds?: Set<number>;
}) {
  const originalIds = new Set(params.primary.map((pick) => pick.id));
  const replacementPool = params.pool.filter(
    (pick) =>
      !originalIds.has(pick.id) &&
      !(params.blockedIds?.has(pick.id) ?? false) &&
      !(params.claimedReplacementIds?.has(pick.id) ?? false)
  );
  const slots: BoardSlot<T, A>[] = [];
  let replacementIndex = 0;

  for (const [index, original] of params.primary.entries()) {
    const isVoided = params.isVoided(original);
    let replacement: T | null = null;

    if (isVoided) {
      while (replacementIndex < replacementPool.length) {
        const candidate = replacementPool[replacementIndex++];
        if (params.isVoided(candidate)) continue;
        replacement = candidate;
        params.claimedReplacementIds?.add(candidate.id);
        break;
      }
    }

    slots.push({
      slotNumber: index + 1,
      original,
      originalAction: params.getAction(original),
      isVoided,
      isRestored: false,
      isPreservedOriginal: false,
      replacement,
      replacementAction: replacement ? params.getAction(replacement) : null,
    });
  }

  return slots;
}

function buildPreservedVoidedSlots<
  T extends { id: number },
  A extends { action: string; boardBucket?: "top" | "value" | null; pickId: number | null; slotNumber?: number | null }
>(params: {
  actions: A[];
  bucket: "top" | "value";
  rowsById: Map<number, T>;
  activeIds: Set<number>;
  pool: T[];
  isVoided: (pick: T) => boolean;
  getAction: (pick: T) => A | null;
  blockedIds?: Set<number>;
  claimedReplacementIds?: Set<number>;
}) {
  const preservedActions = params.actions
    .filter(
      (action) =>
        action.action !== "caution" &&
        action.boardBucket === params.bucket &&
        action.pickId !== null &&
        (action.slotNumber ?? 99) <= 3 &&
        !params.activeIds.has(action.pickId)
    )
    .sort((a, b) => (a.slotNumber ?? 99) - (b.slotNumber ?? 99));

  const replacementPool = params.pool.filter(
    (pick) =>
      !(params.blockedIds?.has(pick.id) ?? false) &&
      !(params.claimedReplacementIds?.has(pick.id) ?? false)
  );

  const slots: BoardSlot<T, A>[] = [];
  let replacementIndex = 0;

  for (const action of preservedActions) {
    const original = params.rowsById.get(action.pickId as number);
    if (!original) continue;

    let replacement: T | null = null;
    while (replacementIndex < replacementPool.length) {
      const candidate = replacementPool[replacementIndex++];
      if (params.isVoided(candidate)) continue;
      replacement = candidate;
      params.claimedReplacementIds?.add(candidate.id);
      break;
    }

    slots.push({
      slotNumber: action.slotNumber ?? params.activeIds.size + slots.length + 1,
      original,
      originalAction: action,
      isVoided: true,
      isRestored: false,
      isPreservedOriginal: true,
      replacement,
      replacementAction: replacement ? params.getAction(replacement) : null,
    });
  }

  return slots;
}

function buildPreservedRestoredSlots<
  T extends { id: number },
  A extends { action: string; boardBucket?: "top" | "value" | null; pickId: number | null; slotNumber?: number | null }
>(params: {
  actions: A[];
  bucket: "top" | "value";
  rowsById: Map<number, T>;
  activeIds: Set<number>;
  canRestore: (pick: T) => boolean;
}) {
  const preservedActions = params.actions
    .filter(
      (action) =>
        action.action === "reinstate" &&
        action.boardBucket === params.bucket &&
        action.pickId !== null &&
        !params.activeIds.has(action.pickId)
    )
    .sort((a, b) => (a.slotNumber ?? 99) - (b.slotNumber ?? 99));

  const slots: BoardSlot<T, A>[] = [];

  for (const action of preservedActions) {
    const original = params.rowsById.get(action.pickId as number);
    if (!original || !params.canRestore(original)) continue;

    slots.push({
      slotNumber: action.slotNumber ?? params.activeIds.size + slots.length + 1,
      original,
      originalAction: action,
      isVoided: false,
      isRestored: true,
      isPreservedOriginal: true,
      replacement: null,
      replacementAction: null,
    });
  }

  return slots;
}

function buildReinstatedSlots<
  T extends { id: number },
  A extends { action: string; boardBucket?: "top" | "value" | null; pickId: number | null; slotNumber?: number | null }
>(params: {
  actions: A[];
  bucket: "top" | "value";
  rowsById: Map<number, T>;
  activeIds: Set<number>;
  canRestore: (pick: T) => boolean;
}) {
  const reinstateActions = params.actions
    .filter(
      (action) =>
        action.action === "reinstate" &&
        action.boardBucket === params.bucket &&
        action.pickId !== null &&
        (action.slotNumber ?? 99) <= 3 &&
        !params.activeIds.has(action.pickId)
    )
    .sort((a, b) => (a.slotNumber ?? 99) - (b.slotNumber ?? 99));

  const slots: BoardSlot<T, A>[] = [];

  for (const action of reinstateActions) {
    const original = params.rowsById.get(action.pickId as number);
    if (!original) continue;

    const canRestore = params.canRestore(original);
    slots.push({
      slotNumber: action.slotNumber ?? params.activeIds.size + slots.length + 1,
      original,
      originalAction: action,
      isVoided: !canRestore,
      isRestored: canRestore,
      isPreservedOriginal: true,
      replacement: null,
      replacementAction: null,
    });
  }

  return slots;
}

function ReplacementBridge({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
        v {label}
      </div>
    </div>
  );
}

function TeamBoardCard({
  pick,
  label,
  teamAction,
  isVoided = false,
  isRestored = false,
  isReplacement = false,
  replacementAvailable = false,
  injuryUpdateLabel,
}: {
  pick: SavedNbaTeamPick;
  label: string;
  teamAction?: NbaTeamInjuryAction | null;
  isVoided?: boolean;
  isRestored?: boolean;
  isReplacement?: boolean;
  replacementAvailable?: boolean;
  injuryUpdateLabel?: string | null;
}) {
  const state = getGameStateMeta(pick.game_start_time, pick.status);
  const marketType = (pick.market_type ?? "spread") as "moneyline" | "spread" | "total";
  const marketLabel = getTeamMarketLabel(marketType);
  const edgeDisplay =
    marketType === "moneyline" ? formatSignedNumber(pick.edge, "%") : pick.edge ?? "N/A";
  const triggerLabel = formatInjuryTriggerLabel({
    reportLabel: teamAction?.triggerReportLabel,
    reportTimestamp: teamAction?.triggerReportTimestamp,
    fallbackLabel: injuryUpdateLabel,
  });
  const boardStatusTriggerLabel =
    isVoided &&
    teamAction?.triggerReportTimestamp &&
    pick.game_start_time &&
    new Date(teamAction.triggerReportTimestamp).getTime() > new Date(pick.game_start_time).getTime()
      ? "an earlier pregame injury report"
      : triggerLabel;

  return (
    <div className={`compact-pick-card rounded-3xl border px-4 py-4 shadow-sm ${getBoardCardTone(pick.status, isVoided ? "voided" : undefined)}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </div>
        <div className="compact-pick-badges flex items-center gap-2 flex-wrap justify-end">
          <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
            {formatCardTime(pick.game_start_time)}
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${state.pillClass}`}>
            {state.pillLabel}
          </div>
          {isVoided ? (
            <div className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Voided
            </div>
          ) : isRestored ? (
            <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Restored
            </div>
          ) : isReplacement ? (
            <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Replacement
            </div>
          ) : null}
          <div className="compact-pick-star-badge rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
            {getConfidenceLabel(getSavedTeamDisplayStars(pick, teamAction))}
          </div>
        </div>
      </div>
      <h3 className="compact-pick-title text-xl font-semibold text-slate-950">{pick.game_label}</h3>
      <div className="compact-pick-summary">
        <p><strong>Pick:</strong> {pick.side}</p>
        <p><strong>Market:</strong> {marketLabel}</p>
        <p><strong>Odds:</strong> {pick.odds_taken ?? "N/A"}</p>
        <p><strong>Prediction:</strong> {formatProjectedScore(pick.home_team, pick.away_team, pick.projected_home_score, pick.projected_away_score)}</p>
      </div>
      <ResponsivePickDetails>
        <p><strong>Pick:</strong> {pick.side}</p>
        <p><strong>Market:</strong> {marketLabel}</p>
        {marketType === "moneyline" ? (
          <>
            <p><strong>Fair line:</strong> {formatAmericanOdds(pick.projected_line)}</p>
            <p><strong>Market line:</strong> {formatAmericanOdds(pick.market_line)}</p>
          </>
        ) : marketType === "total" ? (
          <>
            <p><strong>Line:</strong> {pick.line_taken ?? "N/A"}</p>
            <p><strong>Projected total:</strong> {pick.projected_line ?? "N/A"}</p>
            <p><strong>Market total:</strong> {pick.market_line ?? "N/A"}</p>
          </>
        ) : (
          <>
            <p><strong>Line:</strong> {formatSpread(pick.line_taken)}</p>
            <p><strong>Projected home spread:</strong> {formatSpread(pick.projected_line)}</p>
            <p><strong>Market spread:</strong> {formatSpread(pick.market_line)}</p>
          </>
        )}
        <p><strong>Current odds:</strong> {pick.odds_taken ?? "N/A"}</p>
        <p><strong>Potential payout:</strong> {formatPotentialPayout(pick.odds_taken)}</p>
        <p><strong>Projected score:</strong> {formatProjectedScore(pick.home_team, pick.away_team, pick.projected_home_score, pick.projected_away_score)}</p>
        <p className={getSignalColorClasses(pick.edge)}><strong>Signal:</strong> {pick.edge_label ?? "N/A"}</p>
        <p className={getSignalColorClasses(pick.edge)}><strong>Edge:</strong> {edgeDisplay}</p>
        {teamAction ? (
          <p className={teamAction.action === "remove" ? "text-amber-700" : "text-sky-700"}>
            <strong>Injury watch:</strong> {teamAction.message}
          </p>
        ) : null}
        {isVoided ? (
          <p className="text-amber-700">
            <strong>Board status:</strong>{" "}
            {teamAction?.action === "reinstate"
              ? `Available again after ${triggerLabel}, but the game had already started so this slot stayed frozen.`
              : replacementAvailable
                ? `Voided from ${boardStatusTriggerLabel} and replaced below.`
                : `Voided from ${boardStatusTriggerLabel} with no replacement yet.`}
          </p>
        ) : isRestored ? (
          <p className="text-sky-700">
            <strong>Board status:</strong> Restored after {triggerLabel}.
          </p>
        ) : isReplacement ? (
          <p className="text-sky-700">
            <strong>Board status:</strong> New pick after {triggerLabel}.
          </p>
        ) : null}
        <p><strong>Game state:</strong> {state.detailLabel}</p>
        <p><strong>Status:</strong> {getPickStatusLabel(pick.status)}</p>
        {pick.final_score ? <p><strong>Final score:</strong> {pick.final_score}</p> : null}
        {pick.units_result !== null && pick.units_result !== undefined ? (
          <p><strong>Units result:</strong> {pick.units_result > 0 ? "+" : ""}{pick.units_result.toFixed(2)}u</p>
        ) : null}
      </ResponsivePickDetails>
    </div>
  );
}

function PropBoardCard({
  pick,
  propLabel,
  label,
  propAction,
  isVoided = false,
  isRestored = false,
  isReplacement = false,
  replacementAvailable = false,
  injuryUpdateLabel,
}: {
  pick: SavedNbaPropPick;
  propLabel: string;
  label: string;
  propAction?: NbaPropInjuryAction | null;
  isVoided?: boolean;
  isRestored?: boolean;
  isReplacement?: boolean;
  replacementAvailable?: boolean;
  injuryUpdateLabel?: string | null;
}) {
  const state = getGameStateMeta(pick.game_start_time, pick.status);
  const triggerLabel = formatInjuryTriggerLabel({
    reportLabel: propAction?.triggerReportLabel,
    reportTimestamp: propAction?.triggerReportTimestamp,
    fallbackLabel: injuryUpdateLabel,
  });
  const boardStatusTriggerLabel =
    isVoided &&
    propAction?.triggerReportTimestamp &&
    pick.game_start_time &&
    new Date(propAction.triggerReportTimestamp).getTime() > new Date(pick.game_start_time).getTime()
      ? "an earlier pregame injury report"
      : triggerLabel;

  return (
    <div className={`compact-pick-card rounded-3xl border px-4 py-4 shadow-sm ${getBoardCardTone(pick.status, isVoided ? "voided" : undefined)}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </div>
        <div className="compact-pick-badges flex items-center gap-2 flex-wrap justify-end">
          <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
            {formatCardTime(pick.game_start_time)}
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${state.pillClass}`}>
            {state.pillLabel}
          </div>
          {isVoided ? (
            <div className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Voided
            </div>
          ) : isRestored ? (
            <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Restored
            </div>
          ) : isReplacement ? (
            <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Replacement
            </div>
          ) : null}
          <div className="compact-pick-star-badge rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
            {getConfidenceLabel(getPickConfidenceStars(pick))}
          </div>
        </div>
      </div>
      <h3 className="compact-pick-title text-xl font-semibold text-slate-950">{pick.player_name}</h3>
      <p className="text-sm text-slate-500">{pick.game_label}</p>
      <div className="compact-pick-summary">
        <p><strong>Prop:</strong> {propLabel}</p>
        <p><strong>Pick:</strong> {pick.side}</p>
        <p><strong>Line:</strong> {pick.line_taken ?? "N/A"}</p>
        <p><strong>Odds:</strong> {pick.odds_taken ?? "N/A"}</p>
      </div>
      <ResponsivePickDetails>
        <p><strong>Prop:</strong> {propLabel}</p>
        <p><strong>Pick:</strong> {pick.side}</p>
        <p><strong>Line:</strong> {pick.line_taken ?? "N/A"}</p>
        <p><strong>Current odds:</strong> {pick.odds_taken ?? "N/A"}</p>
        <p><strong>Potential payout:</strong> {formatPotentialPayout(pick.odds_taken)}</p>
        <p><strong>Signal:</strong> {pick.edge_label ?? "Market favorite"}</p>
        {propAction ? (
          <p className={propAction.action === "void" ? "text-amber-700" : "text-sky-700"}>
            <strong>Injury watch:</strong> {propAction.message}
          </p>
        ) : null}
        {isVoided ? (
          <p className="text-amber-700">
            <strong>Board status:</strong>{" "}
            {propAction?.action === "reinstate"
              ? `Available again after ${triggerLabel}, but the game had already started so this slot stayed frozen.`
              : replacementAvailable
                ? `Voided from ${boardStatusTriggerLabel} and replaced below.`
                : `Voided from ${boardStatusTriggerLabel} with no replacement yet.`}
          </p>
        ) : isRestored ? (
          <p className="text-sky-700">
            <strong>Board status:</strong> Restored after {triggerLabel}.
          </p>
        ) : isReplacement ? (
          <p className="text-sky-700">
            <strong>Board status:</strong> New pick after {triggerLabel}.
          </p>
        ) : null}
        <p><strong>Game state:</strong> {state.detailLabel}</p>
        <p><strong>Status:</strong> {getPickStatusLabel(pick.status)}</p>
        {pick.final_stat !== null && pick.final_stat !== undefined ? (
          <p><strong>Final stat:</strong> {pick.final_stat}</p>
        ) : null}
        {pick.final_score ? <p><strong>Final score:</strong> {pick.final_score}</p> : null}
        {pick.units_result !== null && pick.units_result !== undefined ? (
          <p><strong>Units result:</strong> {pick.units_result > 0 ? "+" : ""}{pick.units_result.toFixed(2)}u</p>
        ) : null}
      </ResponsivePickDetails>
    </div>
  );
}

function getMarketDisplay(item: any) {
  const moneyline = item.moneyline?.outcomes ?? [];
  const spreads = item.spreads?.outcomes ?? [];
  const totals = item.totals?.outcomes ?? [];

  return {
    moneyline:
      moneyline.length > 0
        ? moneyline.map((outcome: any) => `${outcome.name} ${outcome.price}`).join(" / ")
        : "Unavailable",
    spread:
      spreads.length > 0
        ? spreads
            .map((outcome: any) => `${outcome.name} ${formatSpread(outcome.point)} (${outcome.price})`)
            .join(" / ")
        : "Unavailable",
    total:
      totals.length > 0
        ? totals.map((outcome: any) => `${outcome.name} ${outcome.point} (${outcome.price})`).join(" / ")
        : "Unavailable",
  };
}

async function tryAutoSyncNbaSlate(day: Extract<NbaOddsCacheDay, "today" | "tomorrow">) {
  const syncSecret = process.env.AUTO_SYNC_SECRET;
  if (!syncSecret) return false;

  try {
    const origin = await getServerRequestOrigin();
    const response = await fetch(
      `${origin}/api/auto-sync?task=nba-slate&day=${day}&syncSecret=${encodeURIComponent(syncSecret)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; propType?: string; view?: string }>;
  }) {
    const params = await searchParams;
  const day: Extract<NbaOddsCacheDay, "today" | "yesterday"> =
    params.day === "yesterday" ? "yesterday" : "today";
  const defaultPropType: (typeof PROP_TYPES)[number] = "pra";
  const propType = PROP_TYPES.includes((params.propType as (typeof PROP_TYPES)[number]) ?? defaultPropType)
      ? ((params.propType as (typeof PROP_TYPES)[number]) ?? defaultPropType)
      : defaultPropType;
    const propLabel = PROP_MARKET_MAP[propType].label;

  const [initialResolvedTeamOdds, initialResolvedProps, isOwner] = await Promise.all([
    getResolvedNbaTeamOddsCache(day),
    getResolvedNbaPropsCache(day, propType as NbaPropMarketType),
    isOwnerLoggedIn(),
  ]);

  let resolvedTeamOdds = initialResolvedTeamOdds;
  let resolvedProps = initialResolvedProps;

  if (day === "today" && !resolvedTeamOdds.active) {
    const synced = await tryAutoSyncNbaSlate(day);
    if (synced) {
      [resolvedTeamOdds, resolvedProps] = await Promise.all([
        getResolvedNbaTeamOddsCache(day),
        getResolvedNbaPropsCache(day, propType as NbaPropMarketType),
      ]);
    }
  }
  const supabase = getSupabaseServer();

  const cachedTeamOdds = resolvedTeamOdds.active;
  const cachedProps = resolvedProps.active;
  const businessDate =
    cachedTeamOdds?.businessDate ??
    cachedProps?.businessDate ??
    resolvedTeamOdds.expectedBusinessDate;
  const [manualUsage, injuryCacheRow, learningProfile, propLearningProfile, teamRowsResult, propRowsResult] = await Promise.all([
    isOwner ? getManualSyncUsage() : Promise.resolve(null),
    businessDate ? getCachedData(`nba_injury_report_${businessDate}`) : Promise.resolve(null),
    buildNbaLearningProfile(),
    buildNbaPropLearningProfile(),
    businessDate
      ? supabase
          .from("picks")
          .select(NBA_TEAM_PICK_SELECT)
          .eq("pick_date", businessDate)
          .eq("sport", "NBA")
          .eq("market_scope", "team")
          .order("is_top_pick", { ascending: false })
          .order("top_pick_rank", { ascending: true })
          .order("market_type", { ascending: true })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as SavedNbaTeamPick[] }),
    businessDate
      ? supabase
          .from("picks")
          .select(NBA_PROP_PICK_SELECT)
          .eq("pick_date", businessDate)
          .eq("sport", "NBA")
          .eq("market_scope", "player_prop")
          .order("market_type", { ascending: true })
          .order("is_top_pick", { ascending: false })
          .order("top_pick_rank", { ascending: true })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as SavedNbaPropPick[] }),
  ]);
  const injurySyncData = ((injuryCacheRow?.data ?? null) as NbaInjurySyncData | null);
  const evaluatedGames = evaluateTeamGames(cachedTeamOdds?.data ?? [], {
    learningProfile,
    injuryRows: injurySyncData?.rows ?? null,
  });
  const slateGames = [...evaluatedGames].sort(
    (a: any, b: any) =>
      new Date(a.game.commence_time).getTime() - new Date(b.game.commence_time).getTime()
  );

  const allTeamRows = (teamRowsResult.data ?? []) as SavedNbaTeamPick[];
  const allPropRows = (propRowsResult.data ?? []) as SavedNbaPropPick[];

  const teamTopPool = allTeamRows
    .filter((row) => row.is_top_pick)
    .sort(
      (a, b) =>
        (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99) ||
        getSavedTeamTopScore(b) - getSavedTeamTopScore(a)
    );
  const teamTopPicks = teamTopPool.slice(0, 3);
  const teamTopReplacementPool = [...allTeamRows].sort(
    (a, b) =>
      Number(Boolean(b.is_top_pick)) - Number(Boolean(a.is_top_pick)) ||
      getSavedTeamTopScore(b) - getSavedTeamTopScore(a) ||
      getSavedTeamValueScore(b) - getSavedTeamValueScore(a)
  );
  const teamBestValuePool = allTeamRows
    .filter((row) => row.notes === "best_value")
    .sort(
      (a, b) =>
        getSavedTeamValueScore(b) - getSavedTeamValueScore(a) ||
        getSavedTeamTopScore(b) - getSavedTeamTopScore(a)
    );
  const teamBestValuePicks = teamBestValuePool.slice(0, 3);
  const teamBestValueReplacementPool = [...allTeamRows].sort(
    (a, b) =>
      Number(b.notes === "best_value") - Number(a.notes === "best_value") ||
      getSavedTeamValueScore(b) - getSavedTeamValueScore(a) ||
      getSavedTeamTopScore(b) - getSavedTeamTopScore(a)
  );
  const lockedPropTopRows = allPropRows
    .filter((row) => row.is_top_pick && row.locked_at)
    .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
  const unlockedPropTopRows = sortTopPropRows(
    allPropRows.filter((row) => row.is_top_pick && !row.locked_at)
  );
  const { rows: propTopPicks } = selectUniqueNbaPropRows(
    [
      ...lockedPropTopRows,
      ...unlockedPropTopRows.filter((row) => !lockedPropTopRows.some((locked) => locked.id === row.id)),
    ],
    3
  );
  const selectedPropTopIds = new Set(propTopPicks.map((row) => row.id));

  const lockedPropBestValueRows = allPropRows
    .filter((row) => row.notes === "best_value" && row.locked_at && !selectedPropTopIds.has(row.id))
    .sort((a, b) => normalizeLookupValue(b.created_at).localeCompare(normalizeLookupValue(a.created_at)));
  const unlockedPropBestValueRows = sortValuePropRows(
    allPropRows.filter(
      (row) => row.notes === "best_value" && !row.locked_at && !selectedPropTopIds.has(row.id)
    )
  );
  const {
    rows: propBestValuePicks,
    conflictKeys: selectedPropBoardConflictKeys,
  } = selectUniqueNbaPropRows(
    [
      ...lockedPropBestValueRows,
      ...unlockedPropBestValueRows.filter(
        (row) => !lockedPropBestValueRows.some((locked) => locked.id === row.id)
      ),
    ],
    3,
    new Set(propTopPicks.map((row) => getNbaPropConflictKey(row)))
  );
  const selectedPropBestValueIds = new Set(propBestValuePicks.map((row) => row.id));
  const activePropBoardConflictKeys = new Set([
    ...propTopPicks.map((row) => getNbaPropConflictKey(row)),
    ...propBestValuePicks.map((row) => getNbaPropConflictKey(row)),
  ]);
  const buildSavedPropAuditKey = (row: SavedNbaPropPick) =>
    `${row.game_label}|${row.player_name ?? ""}|${row.side}|${row.line_taken ?? ""}`;
  const buildAuditPropKey = (row: NbaPropAuditRow) =>
    `${row.gameLabel}|${row.playerName}|${row.side}|${row.line ?? ""}`;
  const selectedTopPropAuditKeys = new Set(propTopPicks.map((row) => buildSavedPropAuditKey(row)));
  const selectedBestValuePropAuditKeys = new Set(
    propBestValuePicks.map((row) => buildSavedPropAuditKey(row))
  );
  const nbaPropAuditSnapshots = businessDate
    ? await Promise.all(PROP_TYPES.map((market) => getNbaPropAuditSnapshot(businessDate, market)))
    : [];
  const nbaPropAuditRows = nbaPropAuditSnapshots.flatMap((snapshot) => snapshot?.rows ?? []);
  const preferredNbaPropAuditRows = nbaPropAuditRows.filter(
    (row) => row.currentModelPreferredSide === row.side
  );
  const nbaPropTopNearMissRows = preferredNbaPropAuditRows
    .filter(
      (row) =>
        row.currentTopEligible &&
        !selectedTopPropAuditKeys.has(buildAuditPropKey(row)) &&
        !selectedBestValuePropAuditKeys.has(buildAuditPropKey(row))
    )
    .sort((a, b) => (b.topScore ?? 0) - (a.topScore ?? 0))
    .slice(0, 5);
  const nbaPropBestValueNearMissRows = preferredNbaPropAuditRows
    .filter(
      (row) =>
        !selectedTopPropAuditKeys.has(buildAuditPropKey(row)) &&
        row.currentBestValueEligible &&
        !selectedBestValuePropAuditKeys.has(buildAuditPropKey(row))
    )
    .sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0))
    .slice(0, 5);
  const preferredNbaPropSelectedCount = preferredNbaPropAuditRows.filter((row) => {
    const key = buildAuditPropKey(row);
    return selectedTopPropAuditKeys.has(key) || selectedBestValuePropAuditKeys.has(key);
  }).length;
  const propTopReplacementPool = buildUniqueNbaPropPool(
    sortTopPropRows(allPropRows.filter((row) => !selectedPropTopIds.has(row.id))),
    activePropBoardConflictKeys
  );
  const propBestValueReplacementPool = buildUniqueNbaPropPool(
    sortValuePropRows(
      allPropRows.filter(
        (row) => !selectedPropTopIds.has(row.id) && !selectedPropBestValueIds.has(row.id)
      )
    ),
    activePropBoardConflictKeys
  );

  const teamActionByGame = new Map<string, NbaTeamInjuryAction[]>();
  const propActionByGame = new Map<string, NbaPropInjuryAction[]>();
  const propVoidBySavedKey = new Map<string, NbaPropInjuryAction>();
  const propVoidByCachedKey = new Map<string, NbaPropInjuryAction>();
  const teamActionByPickId = new Map<number, NbaTeamInjuryAction>();
  const propActionByPickId = new Map<number, NbaPropInjuryAction>();
  const teamRowsById = new Map(allTeamRows.map((pick) => [pick.id, pick]));
  const propRowsById = new Map(allPropRows.map((pick) => [pick.id, pick]));
  const teamTopActiveIds = new Set(teamTopPicks.map((pick) => pick.id));
  const teamBestValueActiveIds = new Set(teamBestValuePicks.map((pick) => pick.id));
  const propTopActiveIds = new Set(propTopPicks.map((pick) => pick.id));
  const propBestValueActiveIds = new Set(propBestValuePicks.map((pick) => pick.id));
  const legacyTeamBoardMetaByPickId = buildLegacyBoardMetaByPickId(
    allTeamRows,
    new Set([...teamTopActiveIds, ...teamBestValueActiveIds])
  );
  const legacyPropBoardMetaByPickId = buildLegacyBoardMetaByPickId(
    allPropRows,
    new Set([...propTopActiveIds, ...propBestValueActiveIds])
  );
  const normalizedTeamActions = (injurySyncData?.teamActions ?? []).map((action) => {
    const legacyMeta =
      action.pickId !== null && action.pickId !== undefined
        ? legacyTeamBoardMetaByPickId.get(action.pickId) ?? null
        : null;

    return {
      ...action,
      boardBucket: action.boardBucket ?? legacyMeta?.boardBucket ?? null,
      slotNumber: action.slotNumber ?? legacyMeta?.slotNumber ?? null,
    };
  });
  const normalizedPropActions = (injurySyncData?.propActions ?? []).map((action) => {
    const legacyMeta =
      action.pickId !== null && action.pickId !== undefined
        ? legacyPropBoardMetaByPickId.get(action.pickId) ?? null
        : null;

    return {
      ...action,
      boardBucket: action.boardBucket ?? legacyMeta?.boardBucket ?? null,
      slotNumber: action.slotNumber ?? legacyMeta?.slotNumber ?? null,
    };
  });

  for (const action of normalizedTeamActions) {
    const existing = teamActionByGame.get(action.gameLabel) ?? [];
    existing.push(action);
    teamActionByGame.set(action.gameLabel, existing);
    if (action.pickId !== null && action.pickId !== undefined) {
      teamActionByPickId.set(action.pickId, action);
    }
  }

  for (const action of normalizedPropActions) {
    const existing = propActionByGame.get(action.gameLabel) ?? [];
    existing.push(action);
    propActionByGame.set(action.gameLabel, existing);
    if (action.pickId !== null && action.pickId !== undefined) {
      propActionByPickId.set(action.pickId, action);
    }

    if (action.action === "void") {
      const savedKey = buildInjuryPropKey(action.gameLabel, action.playerName);
      propVoidBySavedKey.set(savedKey, action);
      const cachedKey = buildInjuryPropKey(action.gameLabel, action.playerName);
      propVoidByCachedKey.set(cachedKey, action);
    }
  }

  const hiddenTeamLabels = new Set(
    normalizedTeamActions
      .filter((action) => action.action === "remove")
      .map((action) => action.gameLabel)
  );
  const preservedTeamTopIds = new Set(
    normalizedTeamActions
      .filter((action) => action.action === "remove" && action.boardBucket === "top" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const restoredTeamTopIds = new Set(
    normalizedTeamActions
      .filter((action) => action.action === "reinstate" && action.boardBucket === "top" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const preservedTeamBestValueIds = new Set(
    normalizedTeamActions
      .filter((action) => action.action === "remove" && action.boardBucket === "value" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const restoredTeamBestValueIds = new Set(
    normalizedTeamActions
      .filter((action) => action.action === "reinstate" && action.boardBucket === "value" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const preservedPropTopIds = new Set(
    normalizedPropActions
      .filter((action) => action.action === "void" && action.boardBucket === "top" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const restoredPropTopIds = new Set(
    normalizedPropActions
      .filter((action) => action.action === "reinstate" && action.boardBucket === "top" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const preservedPropBestValueIds = new Set(
    normalizedPropActions
      .filter((action) => action.action === "void" && action.boardBucket === "value" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const restoredPropBestValueIds = new Set(
    normalizedPropActions
      .filter((action) => action.action === "reinstate" && action.boardBucket === "value" && action.pickId !== null)
      .map((action) => action.pickId as number)
  );
  const teamOriginalIds = new Set([
    ...teamTopActiveIds,
    ...teamBestValueActiveIds,
    ...preservedTeamTopIds,
    ...preservedTeamBestValueIds,
    ...restoredTeamTopIds,
    ...restoredTeamBestValueIds,
  ]);
  const propOriginalIds = new Set([
    ...propTopActiveIds,
    ...propBestValueActiveIds,
    ...preservedPropTopIds,
    ...preservedPropBestValueIds,
    ...restoredPropTopIds,
    ...restoredPropBestValueIds,
  ]);
  const claimedTeamReplacementIds = new Set<number>();
  const claimedPropReplacementIds = new Set<number>();

  function getPropVoidActionForSavedPick(pick: SavedNbaPropPick) {
    return propVoidBySavedKey.get(buildInjuryPropKey(pick.game_label, pick.player_name)) ?? null;
  }

  function getPropVoidActionForCachedProp(prop: CachedPropRow) {
    return propVoidByCachedKey.get(buildInjuryPropKey(prop.game_label, prop.player_name)) ?? null;
  }

  const liveTeamTopSlots = buildBoardSlots({
    primary: teamTopPicks,
    pool: teamTopReplacementPool,
    isVoided: (pick) => hiddenTeamLabels.has(pick.game_label),
    getAction: (pick) => teamActionByPickId.get(pick.id) ?? null,
    blockedIds: teamOriginalIds,
    claimedReplacementIds: claimedTeamReplacementIds,
  });

  const preservedTeamTopSlots = buildPreservedVoidedSlots({
    actions: normalizedTeamActions.filter((action) => action.action === "remove"),
    bucket: "top",
    rowsById: teamRowsById,
    activeIds: teamTopActiveIds,
    pool: teamTopReplacementPool,
    isVoided: (pick) => hiddenTeamLabels.has(pick.game_label),
    getAction: (pick) => teamActionByPickId.get(pick.id) ?? null,
    blockedIds: teamOriginalIds,
    claimedReplacementIds: claimedTeamReplacementIds,
  });
  const restoredTeamTopSlots = buildReinstatedSlots({
    actions: normalizedTeamActions,
    bucket: "top",
    rowsById: teamRowsById,
    activeIds: teamTopActiveIds,
    canRestore: (pick) => !hasGameStarted(pick.game_start_time, pick.status),
  });

  const preservedTeamTopSlotNumbers = new Set([
    ...preservedTeamTopSlots.map((slot) => slot.slotNumber),
    ...restoredTeamTopSlots.map((slot) => slot.slotNumber),
  ]);
  const teamTopSlots = [
    ...liveTeamTopSlots.filter((slot) => !preservedTeamTopSlotNumbers.has(slot.slotNumber)),
    ...restoredTeamTopSlots,
    ...preservedTeamTopSlots,
  ].sort((a, b) => a.slotNumber - b.slotNumber);

  const liveTeamBestValueSlots = buildBoardSlots({
    primary: teamBestValuePicks,
    pool: teamBestValueReplacementPool,
    isVoided: (pick) => hiddenTeamLabels.has(pick.game_label),
    getAction: (pick) => teamActionByPickId.get(pick.id) ?? null,
    blockedIds: teamOriginalIds,
    claimedReplacementIds: claimedTeamReplacementIds,
  });

  const preservedTeamBestValueSlots = buildPreservedVoidedSlots({
    actions: normalizedTeamActions.filter((action) => action.action === "remove"),
    bucket: "value",
    rowsById: teamRowsById,
    activeIds: teamBestValueActiveIds,
    pool: teamBestValueReplacementPool,
    isVoided: (pick) => hiddenTeamLabels.has(pick.game_label),
    getAction: (pick) => teamActionByPickId.get(pick.id) ?? null,
    blockedIds: teamOriginalIds,
    claimedReplacementIds: claimedTeamReplacementIds,
  });
  const restoredTeamBestValueSlots = buildReinstatedSlots({
    actions: normalizedTeamActions,
    bucket: "value",
    rowsById: teamRowsById,
    activeIds: teamBestValueActiveIds,
    canRestore: (pick) => !hasGameStarted(pick.game_start_time, pick.status),
  });

  const preservedTeamBestValueSlotNumbers = new Set(
    [
      ...preservedTeamBestValueSlots.map((slot) => slot.slotNumber),
      ...restoredTeamBestValueSlots.map((slot) => slot.slotNumber),
    ]
  );
  const teamBestValueSlots = [
    ...liveTeamBestValueSlots.filter((slot) => !preservedTeamBestValueSlotNumbers.has(slot.slotNumber)),
    ...restoredTeamBestValueSlots,
    ...preservedTeamBestValueSlots,
  ].sort((a, b) => a.slotNumber - b.slotNumber);

  const livePropTopSlots = buildBoardSlots({
    primary: propTopPicks,
    pool: propTopReplacementPool,
    isVoided: (pick) => Boolean(getPropVoidActionForSavedPick(pick)),
    getAction: (pick) => propActionByPickId.get(pick.id) ?? null,
    blockedIds: propOriginalIds,
    claimedReplacementIds: claimedPropReplacementIds,
  });

  const preservedPropTopSlots = buildPreservedVoidedSlots({
    actions: normalizedPropActions.filter((action) => action.action === "void"),
    bucket: "top",
    rowsById: propRowsById,
    activeIds: propTopActiveIds,
    pool: propTopReplacementPool,
    isVoided: (pick) => Boolean(getPropVoidActionForSavedPick(pick)),
    getAction: (pick) => propActionByPickId.get(pick.id) ?? null,
    blockedIds: propOriginalIds,
    claimedReplacementIds: claimedPropReplacementIds,
  });
  const restoredPropTopSlots = buildReinstatedSlots({
    actions: normalizedPropActions,
    bucket: "top",
    rowsById: propRowsById,
    activeIds: propTopActiveIds,
    canRestore: (pick) => !hasGameStarted(pick.game_start_time, pick.status),
  });

  const preservedPropTopSlotNumbers = new Set([
    ...preservedPropTopSlots.map((slot) => slot.slotNumber),
    ...restoredPropTopSlots.map((slot) => slot.slotNumber),
  ]);
  const propTopSlots = [
    ...livePropTopSlots.filter((slot) => !preservedPropTopSlotNumbers.has(slot.slotNumber)),
    ...restoredPropTopSlots,
    ...preservedPropTopSlots,
  ].sort((a, b) => a.slotNumber - b.slotNumber);

  const livePropBestValueSlots = buildBoardSlots({
    primary: propBestValuePicks,
    pool: propBestValueReplacementPool,
    isVoided: (pick) => Boolean(getPropVoidActionForSavedPick(pick)),
    getAction: (pick) => propActionByPickId.get(pick.id) ?? null,
    blockedIds: propOriginalIds,
    claimedReplacementIds: claimedPropReplacementIds,
  });

  const preservedPropBestValueSlots = buildPreservedVoidedSlots({
    actions: normalizedPropActions.filter((action) => action.action === "void"),
    bucket: "value",
    rowsById: propRowsById,
    activeIds: propBestValueActiveIds,
    pool: propBestValueReplacementPool,
    isVoided: (pick) => Boolean(getPropVoidActionForSavedPick(pick)),
    getAction: (pick) => propActionByPickId.get(pick.id) ?? null,
    blockedIds: propOriginalIds,
    claimedReplacementIds: claimedPropReplacementIds,
  });
  const restoredPropBestValueSlots = buildReinstatedSlots({
    actions: normalizedPropActions,
    bucket: "value",
    rowsById: propRowsById,
    activeIds: propBestValueActiveIds,
    canRestore: (pick) => !hasGameStarted(pick.game_start_time, pick.status),
  });

  const preservedPropBestValueSlotNumbers = new Set(
    [
      ...preservedPropBestValueSlots.map((slot) => slot.slotNumber),
      ...restoredPropBestValueSlots.map((slot) => slot.slotNumber),
    ]
  );
  const propBestValueSlots = [
    ...livePropBestValueSlots.filter((slot) => !preservedPropBestValueSlotNumbers.has(slot.slotNumber)),
    ...restoredPropBestValueSlots,
    ...preservedPropBestValueSlots,
  ].sort((a, b) => a.slotNumber - b.slotNumber);

  const propSelectionByKey = new Map<
    string,
    { label: string; tone: string }
  >();
  for (const slot of propTopSlots) {
    propSelectionByKey.set(buildSavedPropKey(slot.original), {
      label: slot.isVoided
        ? `Voided Top Pick #${slot.slotNumber}`
        : slot.isRestored
          ? `Restored Top Pick #${slot.slotNumber}`
          : `Top Pick #${slot.slotNumber}`,
      tone: slot.isVoided
        ? "border-amber-200/80 bg-amber-50 text-amber-700"
        : slot.isRestored
          ? "border-sky-200/80 bg-sky-50 text-sky-700"
          : "border-emerald-200/80 bg-emerald-50 text-emerald-700",
    });
    if (slot.replacement) {
      propSelectionByKey.set(buildSavedPropKey(slot.replacement), {
        label: `Replacement for Top Pick #${slot.slotNumber}`,
        tone: "border-sky-200/80 bg-sky-50 text-sky-700",
      });
    }
  }
  for (const slot of propBestValueSlots) {
    propSelectionByKey.set(buildSavedPropKey(slot.original), {
      label: slot.isVoided
        ? `Voided Value #${slot.slotNumber}`
        : slot.isRestored
          ? `Restored Value #${slot.slotNumber}`
          : `Value #${slot.slotNumber}`,
      tone: slot.isVoided
        ? "border-amber-200/80 bg-amber-50 text-amber-700"
        : slot.isRestored
          ? "border-sky-200/80 bg-sky-50 text-sky-700"
          : "border-violet-200/80 bg-violet-50 text-violet-700",
    });
    if (slot.replacement) {
      propSelectionByKey.set(buildSavedPropKey(slot.replacement), {
        label: `Replacement for Value #${slot.slotNumber}`,
        tone: "border-sky-200/80 bg-sky-50 text-sky-700",
      });
    }
  }

  const cachedPropsByGame = new Map<string, CachedPropRow[]>();
  for (const row of ((cachedProps?.data ?? []) as CachedPropRow[])) {
    const existing = cachedPropsByGame.get(row.game_label) ?? [];
    existing.push(row);
    cachedPropsByGame.set(row.game_label, existing);
  }

  const teamTopLabels = new Set(
    teamTopSlots.flatMap((slot) => [
      slot.original.game_label,
      ...(slot.replacement ? [slot.replacement.game_label] : []),
    ])
  );
  const teamBestValueLabels = new Set(
    teamBestValueSlots.flatMap((slot) => [
      slot.original.game_label,
      ...(slot.replacement ? [slot.replacement.game_label] : []),
    ])
  );
  const injuryUpdateLabel = injurySyncData?.reportLabel
    ? `${injurySyncData.reportLabel} official report`
    : injurySyncData?.checkedAt
      ? formatCheckedTime(injurySyncData.checkedAt)
      : null;

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="app-card mb-8 grid gap-6 rounded-[2rem] p-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="app-eyebrow">NBA board</div>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">NBA Picks Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Built in the same board style as MLB. NBA is still in learning mode, so we are keeping the board selective and logging what the playoffs teach us.
          </p>
          {day === "today" && (resolvedTeamOdds.usedTomorrowFallback || resolvedProps.usedTomorrowFallback) ? (
            <p className="mt-2 text-sm text-amber-700">
              Loaded the preloaded NBA slate because it already matched today&apos;s betting day.
            </p>
          ) : null}
          {resolvedTeamOdds.isStale && !cachedTeamOdds ? (
            <p className="mt-2 text-sm text-rose-700">
              No fresh NBA slate is cached for {resolvedTeamOdds.expectedBusinessDate}. The last cached betting day was{" "}
              <strong>{resolvedTeamOdds.primary?.businessDate ?? "unknown"}</strong>, so the board will stay empty until NBA sync succeeds.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 self-start sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Betting day</div>
            <div className="mt-2 text-lg font-semibold text-slate-950">{businessDate ?? resolvedTeamOdds.expectedBusinessDate}</div>
            <p className="mt-1 text-sm text-slate-600">Rolls over at 5:00 AM ET.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Board view</div>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/dashboard?day=today&propType=${propType}`}
                className={`app-pill rounded-full px-4 py-2 text-sm font-medium ${
                  day === "today" ? "app-pill-active" : "text-slate-700"
                }`}
              >
                Today
              </Link>
              <Link
                href={`/dashboard?day=yesterday&propType=${propType}`}
                className={`app-pill rounded-full px-4 py-2 text-sm font-medium ${
                  day === "yesterday" ? "app-pill-active" : "text-slate-700"
                }`}
              >
                Yesterday
              </Link>
            </div>
          </div>
        </div>
      </div>

      {isOwner ? (
        <FoldPanel
          eyebrow="Owner sync"
          title="Refresh NBA board"
          summary="Run the full team or prop syncs, apply the hourly injury pass, or grade settled results."
          badge={
            <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
              Manual credit-using syncs today: {manualUsage?.count ?? 0}
            </div>
          }
          defaultOpen={false}
          className="mb-8"
        >
          {day === "today" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SyncButton label="Sync Team Odds" endpoint="/api/sync-team-odds?day=today" description="Refreshes today's raw team slate." />
              <SyncButton
                label="Sync Team Board"
                endpoint="/api/sync-top-picks?day=today"
                description="Builds team Top Picks and Best Value from moneyline, spread, and total together."
              />
              <SyncButton
                label="Sync NBA Injuries"
                endpoint="/api/sync-nba-injuries?day=today"
                description="After 9 AM ET, high-impact status changes also recheck team picks and all prop markets."
              />
              <SyncButton
                label="Sync All NBA Props"
                endpoint="/api/sync-props?day=today&propType=all"
                description="Caches every supported NBA prop market and rebuilds the overall prop board."
              />
              <SyncButton label="Grade Results" endpoint="/api/grade-picks" description="Grades settled picks without touching frozen board history." />
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4 text-sm text-slate-600">
              Yesterday shows saved board history only. Switch back to Today to run NBA syncs.
            </div>
          )}
        </FoldPanel>
      ) : null}

      <AllSportsFreePicksBoard pickDate={businessDate} />

      {injurySyncData ? (
        <FoldPanel
          eyebrow="NBA injury watch"
          title="Hourly Injury Recheck"
          summary={`Last checked ${formatCheckedTime(injurySyncData.checkedAt)}${injurySyncData.reportLabel ? ` from the ${injurySyncData.reportLabel} official report` : ""}.`}
          actions={
            injurySyncData.reportUrl ? (
              <Link href={injurySyncData.reportUrl} className="app-pill rounded-full px-4 py-2 text-sm font-medium text-slate-700">
                Open Official Report
              </Link>
            ) : null
          }
          defaultOpen={
            injurySyncData.teamActions.length > 0 ||
            injurySyncData.propActions.length > 0 ||
            injurySyncData.significantChanges.length > 0 ||
            Boolean(injurySyncData.boardRecheck?.changes.length || injurySyncData.boardRecheck?.error)
          }
          className="mb-8"
        >
          {injurySyncData.teamActions.length === 0 &&
          injurySyncData.propActions.length === 0 &&
          injurySyncData.significantChanges.length === 0 &&
          !injurySyncData.boardRecheck ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4 text-sm text-slate-600">
              No high-impact NBA injury overrides are active right now.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
                <h3 className="font-semibold text-slate-950 mb-2">Removed Team Picks</h3>
                {(injurySyncData.teamActions.filter((action) => action.action === "remove")).length === 0 ? (
                  <p className="text-sm text-slate-500">None right now.</p>
                ) : (
                  <div className="space-y-2 text-sm text-slate-700">
                    {injurySyncData.teamActions
                      .filter((action) => action.action === "remove")
                      .map((action, index) => (
                        <div key={`${action.gameLabel}-${action.playerName}-${index}`} className="rounded-2xl bg-rose-50 px-3 py-3 text-rose-900">
                          <p className="font-medium">{action.gameLabel}</p>
                          <p>{action.message}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
                <h3 className="font-semibold text-slate-950 mb-2">Voided Props</h3>
                {(injurySyncData.propActions.filter((action) => action.action === "void")).length === 0 ? (
                  <p className="text-sm text-slate-500">None right now.</p>
                ) : (
                  <div className="space-y-2 text-sm text-slate-700">
                    {injurySyncData.propActions
                      .filter((action) => action.action === "void")
                      .map((action, index) => (
                        <div key={`${action.gameLabel}-${action.playerName}-${index}`} className="rounded-2xl bg-amber-50 px-3 py-3 text-amber-900">
                          <p className="font-medium">{action.playerName}</p>
                          <p>{action.message}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
                <h3 className="font-semibold text-slate-950 mb-2">Recent High-Impact Changes</h3>
                {injurySyncData.significantChanges.length === 0 ? (
                  <p className="text-sm text-slate-500">No major status changes since the last sync.</p>
                ) : (
                  <div className="space-y-2 text-sm text-slate-700">
                    {injurySyncData.significantChanges.slice(0, 6).map((change, index) => (
                      <div key={`${change.team}-${change.playerName}-${index}`} className="rounded-2xl bg-sky-50 px-3 py-3 text-sky-900">
                        <p className="font-medium">{change.playerName} - {change.team}</p>
                        <p>
                          {change.fromStatus ? `${change.fromStatus} -> ${change.toStatus}` : `Now ${change.toStatus}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
                <h3 className="font-semibold text-slate-950 mb-2">Board Recheck</h3>
                {!injurySyncData.boardRecheck ? (
                  <p className="text-sm text-slate-500">No after-9 AM board rebuild was needed on this check.</p>
                ) : (
                  <div className="space-y-3 text-sm text-slate-700">
                    <div className="rounded-2xl bg-emerald-50 px-3 py-3 text-emerald-950">
                      <p className="font-medium">
                        {injurySyncData.boardRecheck.ran ? "Rechecked" : "Queued"} at{" "}
                        {formatCheckedTime(injurySyncData.boardRecheck.triggeredAt)}
                      </p>
                      <p>{injurySyncData.boardRecheck.reason}</p>
                    </div>
                    {injurySyncData.boardRecheck.error ? (
                      <div className="rounded-2xl bg-rose-50 px-3 py-3 text-rose-900">
                        {injurySyncData.boardRecheck.error}
                      </div>
                    ) : null}
                    {injurySyncData.boardRecheck.triggerPlayerResults?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Why we changed
                        </p>
                        {injurySyncData.boardRecheck.triggerPlayerResults.slice(0, 4).map((player, index) => (
                          <div
                            key={`${player.team}-${player.playerName}-${index}`}
                            className="rounded-2xl bg-white/80 px-3 py-3 text-slate-700"
                          >
                            <p className="font-medium text-slate-950">
                              {player.playerName} - {formatNbaAvailabilityLabel(player.availability)}
                            </p>
                            <p>
                              Report said {player.reportStatus}
                              {player.reason ? ` (${player.reason})` : ""}.
                            </p>
                            {player.finalNote ? <p className="text-slate-500">{player.finalNote}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : injurySyncData.boardRecheck.triggerPlayers.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Why we changed
                        </p>
                        {injurySyncData.boardRecheck.triggerPlayers.slice(0, 4).map((player, index) => (
                          <div
                            key={`${player.team}-${player.playerName}-${index}`}
                            className="rounded-2xl bg-white/80 px-3 py-3 text-slate-700"
                          >
                            <p className="font-medium text-slate-950">{player.playerName}</p>
                            <p>
                              Report said {player.reportStatus}
                              {player.reason ? ` (${player.reason})` : ""}. Final availability will fill in after Grade Results.
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {injurySyncData.boardRecheck.changes.length === 0 ? (
                      <p className="text-slate-500">No featured board slots changed after the recheck.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          What changed
                        </p>
                        {injurySyncData.boardRecheck.changes.slice(0, 6).map((change, index) => (
                          <div
                            key={`${change.board}-${change.slotNumber}-${index}`}
                            className="rounded-2xl bg-sky-50 px-3 py-3 text-sky-900"
                          >
                            <p className="font-medium">
                              {formatNbaBoardRecheckLabel(change.board)} #{change.slotNumber}
                            </p>
                            <p>{change.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {injurySyncData.boardRecheck.resultComparisons?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Replacement results
                        </p>
                        {injurySyncData.boardRecheck.resultComparisons.slice(0, 6).map((comparison, index) => (
                          <div
                            key={`${comparison.board}-${comparison.slotNumber}-result-${index}`}
                            className={`rounded-2xl px-3 py-3 ${getRecheckVerdictTone(comparison.verdict)}`}
                          >
                            <p className="font-medium">
                              {formatNbaBoardRecheckLabel(comparison.board)} #{comparison.slotNumber}
                            </p>
                            <p>{comparison.summary}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </FoldPanel>
      ) : null}

      <FoldPanel
        eyebrow="Future audit replay"
        title="Featured prop diagnostics"
        summary="See which NBA props almost made the featured board and how far they were from today’s thresholds."
        badge={
          <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-medium text-slate-700">
            Preferred sides on board: {preferredNbaPropSelectedCount}/{preferredNbaPropAuditRows.length}
          </div>
        }
        defaultOpen={false}
        className="mb-8"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold text-slate-950">Top Pick near-misses</h3>
                <p className="text-sm text-slate-600">Strong props that qualified on paper but got crowded off the top lane.</p>
              </div>
              <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {nbaPropTopNearMissRows.length} shown
              </div>
            </div>
            {nbaPropTopNearMissRows.length === 0 ? (
              <p className="text-sm text-slate-600">No Top Pick near-misses right now. If the board stayed empty, the gate likely filtered them before they got close.</p>
            ) : (
              <div className="grid gap-3">
                {nbaPropTopNearMissRows.map((row) => (
                  <div key={`${row.externalEventId}-${row.playerName}-${row.side}`} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-slate-950">{row.playerName}</div>
                        <div className="text-xs text-slate-500">{row.gameLabel} | {getPropMarketLabel(row.propType)}</div>
                      </div>
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                        {formatCardTime(row.commenceTime)}
                      </div>
                    </div>
                    <p><strong>Side:</strong> {row.side} @ {row.oddsTaken ?? "N/A"}</p>
                    <p><strong>Top score:</strong> {formatDecimal(row.topScore)} | <strong>Threshold:</strong> {formatDecimal(row.currentThresholdTop)}</p>
                    <p><strong>Gap:</strong> {formatSignedNumber((row.topScore ?? 0) - (row.currentThresholdTop ?? 0))}</p>
                    <p><strong>Market score:</strong> {formatDecimal(row.marketScore)} | <strong>Value score:</strong> {formatDecimal(row.valueScore)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold text-slate-950">Best Value near-misses</h3>
                <p className="text-sm text-slate-600">Props that cleared the value gate but still lost the lane after Top Picks were taken out.</p>
              </div>
              <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {nbaPropBestValueNearMissRows.length} shown
              </div>
            </div>
            {nbaPropBestValueNearMissRows.length === 0 ? (
              <p className="text-sm text-slate-600">No Best Value near-misses right now. The current board is either taking the preferred side or filtering it earlier.</p>
            ) : (
              <div className="grid gap-3">
                {nbaPropBestValueNearMissRows.map((row) => (
                  <div key={`${row.externalEventId}-${row.playerName}-${row.side}`} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-slate-950">{row.playerName}</div>
                        <div className="text-xs text-slate-500">{row.gameLabel} | {getPropMarketLabel(row.propType)}</div>
                      </div>
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                        {formatCardTime(row.commenceTime)}
                      </div>
                    </div>
                    <p><strong>Side:</strong> {row.side} @ {row.oddsTaken ?? "N/A"}</p>
                    <p><strong>Value score:</strong> {formatDecimal(row.valueScore)} | <strong>Threshold:</strong> {formatDecimal(row.currentThresholdValue)}</p>
                    <p><strong>Gap:</strong> {formatSignedNumber((row.valueScore ?? 0) - (row.currentThresholdValue ?? 0))}</p>
                    <p><strong>Top score:</strong> {formatDecimal(row.topScore)} | <strong>Market score:</strong> {formatDecimal(row.marketScore)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </FoldPanel>

      <section className="mb-10">
        <div className="mobile-pick-board-grid grid grid-cols-2 gap-3 xl:gap-6">
          <div className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Team Top Picks</h2>
                <p className="text-sm text-slate-600">Cleaner overall team spots we are willing to feature across moneyline, spread, and total.</p>
              </div>
              <div className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Up to 3
              </div>
            </div>
            <div className="grid gap-4">
              {teamTopSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-sm text-slate-600">
                  <>No team top picks saved yet. Run <strong>Sync Team Board</strong> to build them.</>
                </div>
              ) : (
                teamTopSlots.map((slot) => (
                  <div key={slot.original.id} className="space-y-3">
                    <TeamBoardCard
                      pick={slot.original}
                      label={`Top Pick #${slot.slotNumber}`}
                      teamAction={slot.originalAction}
                      isVoided={slot.isVoided}
                      isRestored={slot.isRestored}
                      replacementAvailable={Boolean(slot.replacement)}
                      injuryUpdateLabel={injuryUpdateLabel}
                    />
                    {slot.replacement ? (
                      <>
                        <ReplacementBridge label={`New pick after ${injuryUpdateLabel ?? "injury update"}`} />
                        <TeamBoardCard
                          pick={slot.replacement}
                          label={`Replacement for Top Pick #${slot.slotNumber}`}
                          teamAction={slot.replacementAction}
                          isReplacement
                          injuryUpdateLabel={injuryUpdateLabel}
                        />
                      </>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Team Best Value</h2>
                <p className="text-sm text-slate-600">Best remaining team prices from the same mixed-market slate after Top Picks are taken out.</p>
              </div>
              <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                Up to 3
              </div>
            </div>
            <div className="grid gap-4">
              {teamBestValueSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-sm text-slate-600">
                  No team Best Value rows saved yet. Team board sync now builds them together with Top Picks.
                </div>
              ) : (
                teamBestValueSlots.map((slot) => (
                  <div key={slot.original.id} className="space-y-3">
                    <TeamBoardCard
                      pick={slot.original}
                      label={`Value Pick #${slot.slotNumber}`}
                      teamAction={slot.originalAction}
                      isVoided={slot.isVoided}
                      isRestored={slot.isRestored}
                      replacementAvailable={Boolean(slot.replacement)}
                      injuryUpdateLabel={injuryUpdateLabel}
                    />
                    {slot.replacement ? (
                      <>
                        <ReplacementBridge label={`New pick after ${injuryUpdateLabel ?? "injury update"}`} />
                        <TeamBoardCard
                          pick={slot.replacement}
                          label={`Replacement for Value Pick #${slot.slotNumber}`}
                          teamAction={slot.replacementAction}
                          isReplacement
                          injuryUpdateLabel={injuryUpdateLabel}
                        />
                      </>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <div className="mobile-pick-board-grid grid grid-cols-2 gap-3 xl:gap-6">
          <div className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Prop Top Picks</h2>
                <p className="text-sm text-slate-600">Chosen from the full saved player-prop pool, not locked to one category.</p>
              </div>
              <div className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Overall
              </div>
            </div>
            <div className="grid gap-4">
              {propTopSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-sm text-slate-600">
                  <>No prop top picks saved yet for the featured lane. Run the prop syncs to build them.</>
                </div>
              ) : (
                propTopSlots.map((slot) => (
                  <div key={slot.original.id} className="space-y-3">
                    <PropBoardCard
                      pick={slot.original}
                      propLabel={getPropMarketLabel(slot.original.market_type)}
                      label={`Prop Top Pick #${slot.slotNumber}`}
                      propAction={slot.originalAction}
                      isVoided={slot.isVoided}
                      isRestored={slot.isRestored}
                      replacementAvailable={Boolean(slot.replacement)}
                      injuryUpdateLabel={injuryUpdateLabel}
                    />
                    {slot.replacement ? (
                      <>
                        <ReplacementBridge label={`New pick after ${injuryUpdateLabel ?? "injury update"}`} />
                        <PropBoardCard
                          pick={slot.replacement}
                          propLabel={getPropMarketLabel(slot.replacement.market_type)}
                          label={`Replacement for Prop Top Pick #${slot.slotNumber}`}
                          propAction={slot.replacementAction}
                          isReplacement
                          injuryUpdateLabel={injuryUpdateLabel}
                        />
                      </>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Prop Best Value</h2>
                <p className="text-sm text-slate-600">Best remaining prices from the full saved player-prop pool after Top Picks are taken out.</p>
              </div>
              <div className="rounded-full border border-violet-200/80 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                Overall
              </div>
            </div>
            <div className="grid gap-4">
              {propBestValueSlots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-sm text-slate-600">
                  <>No prop Best Value rows saved yet for the featured lane. They are built during the same prop sync now.</>
                </div>
              ) : (
                propBestValueSlots.map((slot) => (
                  <div key={slot.original.id} className="space-y-3">
                    <PropBoardCard
                      pick={slot.original}
                      propLabel={getPropMarketLabel(slot.original.market_type)}
                      label={`Prop Value #${slot.slotNumber}`}
                      propAction={slot.originalAction}
                      isVoided={slot.isVoided}
                      isRestored={slot.isRestored}
                      replacementAvailable={Boolean(slot.replacement)}
                      injuryUpdateLabel={injuryUpdateLabel}
                    />
                    {slot.replacement ? (
                      <>
                        <ReplacementBridge label={`New pick after ${injuryUpdateLabel ?? "injury update"}`} />
                        <PropBoardCard
                          pick={slot.replacement}
                          propLabel={getPropMarketLabel(slot.replacement.market_type)}
                          label={`Replacement for Prop Value #${slot.slotNumber}`}
                          propAction={slot.replacementAction}
                          isReplacement
                          injuryUpdateLabel={injuryUpdateLabel}
                        />
                      </>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Slate Games</h2>
            <p className="text-sm text-slate-600">
              The featured NBA team board can now pull from moneyline, spread, or total, and these game cards show the full menu behind those decisions.
            </p>
          </div>
        </div>

        {!cachedTeamOdds || slateGames.length === 0 ? (
            <div className="app-panel rounded-3xl p-6 text-sm text-slate-600">
              No NBA slate is cached for betting day <strong>{resolvedTeamOdds.expectedBusinessDate}</strong> yet. Start with <strong>Sync Team Odds</strong>.
            </div>
          ) : (
          <div className="space-y-5">
            {slateGames.map((item: any) => {
              const label = `${item.game.away_team} @ ${item.game.home_team}`;
              const marketDisplay = getMarketDisplay(item);
              const teamTopTag = teamTopLabels.has(label);
              const teamValueTag = teamBestValueLabels.has(label);
              const cachedGameProps = cachedPropsByGame.get(label) ?? [];
              const gameTeamActions = teamActionByGame.get(label) ?? [];
              const gamePropActions = propActionByGame.get(label) ?? [];
              const gameInjuryRows = (injurySyncData?.rows ?? []).filter(
                (row) =>
                  normalizeLookupValue(row.team) === normalizeLookupValue(item.game.home_team) ||
                  normalizeLookupValue(row.team) === normalizeLookupValue(item.game.away_team)
              );

              return (
                <CollapsibleGameCard
                  key={item.game.id}
                  title={label}
                  subtitle={formatCardTime(item.game.commence_time)}
                  badges={
                    <>
                      <div className={`rounded-full border px-3 py-1 text-xs font-medium ${getGameStateMeta(item.game.commence_time, null).pillClass}`}>
                        {getGameStateMeta(item.game.commence_time, null).pillLabel}
                      </div>
                      {teamTopTag ? (
                        <div className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          Team Top Pick
                        </div>
                      ) : null}
                      {teamValueTag ? (
                        <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                          Team Best Value
                        </div>
                      ) : null}
                      {gameTeamActions.some((action) => action.action === "remove") ? (
                        <div className="rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                          Team pick removed
                        </div>
                      ) : null}
                      {gamePropActions.some((action) => action.action === "void") ? (
                        <div className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          Props voided
                        </div>
                      ) : null}
                      {cachedGameProps.length > 0 ? (
                        <div className="rounded-full border border-violet-200/80 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                          {cachedGameProps.length} {propLabel} props
                        </div>
                      ) : null}
                    </>
                  }
                  summary={
                    <div className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-3">
                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-4 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Moneyline</h3>
                          <div className="space-y-1 text-sm text-slate-700">
                            <p><strong>Market:</strong> {marketDisplay.moneyline}</p>
                            {item.moneyline?.outcomes?.map((outcome: any) => (
                              <p key={outcome.name}>
                                <strong>{outcome.name} implied %:</strong> {americanToImpliedProb(outcome.price).toFixed(1)}%
                              </p>
                            ))}
                            <p><strong>Projected winner:</strong> {item.projectedWinner === "home" ? item.game.home_team : item.projectedWinner === "away" ? item.game.away_team : "N/A"}</p>
                            <p><strong>Fair price:</strong> {item.fairHomeMoneyline ?? "N/A"} / {item.fairAwayMoneyline ?? "N/A"}</p>
                            <p><strong>Pick:</strong> {item.moneylineSide ?? "Pass"}</p>
                            <p className={getSignalColorClasses(item.moneylineEdgePercent)}><strong>Signal:</strong> {item.moneylineSignal ?? "Pass"}</p>
                            <p className={getSignalColorClasses(item.moneylineEdgePercent)}><strong>Edge:</strong> {formatSignedNumber(item.moneylineEdgePercent, "%")}</p>
                            <p><strong>Confidence:</strong> {getConfidenceLabel(getPickConfidenceStars({
                              sport: "NBA",
                              market_type: "moneyline",
                              edge: item.moneylineEdgePercent,
                              confidence_score: item.moneylineConfidenceScore,
                              game_start_time: item.game.commence_time,
                            }))}</p>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-4 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Spread</h3>
                          <div className="space-y-1 text-sm text-slate-700">
                            <p><strong>Market:</strong> {marketDisplay.spread}</p>
                            <p><strong>Projected home spread:</strong> {formatSpread(item.projectedHomeSpread)}</p>
                            <p className={getSignalColorClasses(item.spreadEdge)}><strong>Signal:</strong> {item.signal}</p>
                            <p className={getSignalColorClasses(item.spreadEdge)}><strong>Edge:</strong> {item.spreadEdge ?? "N/A"}</p>
                            <p><strong>Confidence:</strong> {getConfidenceLabel(getPickConfidenceStars({
                              sport: "NBA",
                              market_type: "spread",
                              edge: item.spreadEdge,
                              confidence_score: item.confidenceScore,
                              game_start_time: item.game.commence_time,
                            }))}</p>
                            {item.officialSide ? <p><strong>Board side:</strong> {item.officialSide}</p> : null}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-4 shadow-sm">
                          <h3 className="font-semibold text-slate-950 mb-3">Total</h3>
                          <div className="space-y-1 text-sm text-slate-700">
                            <p><strong>Market:</strong> {marketDisplay.total}</p>
                            <p><strong>Projected score:</strong> {formatProjectedScore(item.game.home_team, item.game.away_team, item.projectedHomeScore, item.projectedAwayScore)}</p>
                            <p><strong>Projected total:</strong> {item.projectedTotal ?? "N/A"}</p>
                            <p><strong>Market total:</strong> {item.marketTotal ?? "N/A"}</p>
                            <p><strong>Pick:</strong> {item.totalSide ?? "Pass"}</p>
                            <p className={getSignalColorClasses(item.totalEdge)}><strong>Signal:</strong> {item.totalSignal ?? "Pass"}</p>
                            <p className={getSignalColorClasses(item.totalEdge)}><strong>Edge:</strong> {formatSignedNumber(item.totalEdge)}</p>
                            <p><strong>Confidence:</strong> {getConfidenceLabel(getPickConfidenceStars({
                              sport: "NBA",
                              market_type: "total",
                              edge: item.totalEdge,
                              confidence_score: item.totalConfidenceScore,
                              game_start_time: item.game.commence_time,
                            }))}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                        <strong>Projected score:</strong> {formatProjectedScore(item.game.home_team, item.game.away_team, item.projectedHomeScore, item.projectedAwayScore)}
                      </div>
                    </div>
                  }
                  details={
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-700">
                        <h4 className="font-semibold text-slate-900 mb-2">Model Notes</h4>
                        <p>
                          The same projection now lets moneyline, spread, and total compete for the featured board instead of forcing everything through the spread lane.
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-700">
                        <h4 className="font-semibold text-slate-900 mb-2">Official Injury Watch</h4>
                        {gameTeamActions.length === 0 && gamePropActions.length === 0 && gameInjuryRows.length === 0 ? (
                          <p className="text-slate-500">No tracked injury override is active for this matchup right now.</p>
                        ) : (
                          <div className="space-y-3">
                            {gameTeamActions.map((action, index) => (
                              <div
                                key={`${action.gameLabel}-${action.playerName}-${index}`}
                                className={`rounded-2xl px-3 py-3 ${
                                  action.action === "remove"
                                    ? "bg-rose-50 text-rose-900"
                                    : "bg-amber-50 text-amber-900"
                                }`}
                              >
                                <p className="font-medium">{action.playerName} - {action.team}</p>
                                <p>{action.message}</p>
                              </div>
                            ))}

                            {gamePropActions
                              .filter((action) => action.action === "void")
                              .map((action, index) => (
                                <div
                                  key={`${action.gameLabel}-${action.playerName}-prop-${index}`}
                                  className="rounded-2xl bg-amber-50 px-3 py-3 text-amber-900"
                                >
                                  <p className="font-medium">{action.playerName}</p>
                                  <p>{action.message}</p>
                                </div>
                              ))}

                            {gameInjuryRows.length > 0 ? (
                              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                <p className="font-medium text-slate-900 mb-2">Current report rows</p>
                                <div className="space-y-1">
                                  {gameInjuryRows.slice(0, 8).map((row, index) => (
                                    <p key={`${row.team}-${row.playerName}-${index}`} className="text-slate-700">
                                      <strong>{row.playerName}</strong> - {row.team}: {row.statusLabel}
                                      {row.reason ? ` (${row.reason})` : ""}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-white/72 px-4 py-3">
                        <h4 className="font-semibold text-slate-900 mb-2">Synced {propLabel} Props For This Game</h4>
                        {cachedGameProps.length === 0 ? (
                          <p className="text-sm text-slate-600">
                            No synced {propLabel.toLowerCase()} props for this game yet. Use <strong>Sync {propLabel} Props</strong> above to load them.
                          </p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {cachedGameProps.map((prop, index) => {
                              const selectedTag = propSelectionByKey.get(buildCachedPropKey(prop));
                              const propVoidAction = getPropVoidActionForCachedProp(prop);
                              const propStars = getCachedPropStars(prop, propLearningProfile);
                              const propTopScore = getCachedPropTopScore(prop, propLearningProfile);
                              const propValueScore = getCachedPropValueScore(prop, propLearningProfile);
                              return (
                                <div
                                  key={`${prop.game_label}-${prop.player_name}-${prop.line}-${index}`}
                                  className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                                >
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                      <div className="font-semibold text-slate-900">{prop.player_name}</div>
                                      <div className="text-xs text-slate-500">{propLabel}</div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                      {propVoidAction ? (
                                        <div className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                          Voided
                                        </div>
                                      ) : null}
                                      {selectedTag ? (
                                        <div className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedTag.tone}`}>
                                          {selectedTag.label}
                                        </div>
                                      ) : null}
                                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                                        {getConfidenceLabel(propStars)}
                                      </div>
                                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                                        {formatCardTime(prop.commence_time)}
                                      </div>
                                    </div>
                                  </div>
                                  <p><strong>Line:</strong> {prop.line ?? "N/A"}</p>
                                  <p><strong>Over:</strong> {prop.over_odds ?? "N/A"}</p>
                                  <p><strong>Under:</strong> {prop.under_odds ?? "N/A"}</p>
                                  <p><strong>Official side:</strong> {prop.official_side ?? "N/A"}</p>
                                  <p><strong>Official odds:</strong> {prop.official_odds ?? "N/A"}</p>
                                  <p><strong>Market score:</strong> {prop.market_score ?? "N/A"}</p>
                                  <p><strong>Model rating:</strong> {getConfidenceLabel(propStars)}</p>
                                  <p><strong>Top score:</strong> {propTopScore.toFixed(1)} | <strong>Value score:</strong> {propValueScore.toFixed(1)}</p>
                                  <p><strong>Signal:</strong> {prop.signal ?? "Market favorite"}</p>
                                  {propVoidAction ? (
                                    <p className="text-amber-800"><strong>Injury override:</strong> {propVoidAction.message}</p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

