import { NextRequest, NextResponse } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";
import {
  buildNbaInjurySyncData,
  fetchOfficialNbaInjuryReport,
  type NbaBoardRecheckChange,
  type NbaBoardRecheckPick,
  type NbaInjuryBoardRecheck,
  type NbaInjuryTriggerPlayer,
  type NbaInjuryReportRow,
  type NbaInjurySyncData,
} from "@/lib/nbaInjuries";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";

type TeamPickRow = {
  id: number;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  side?: string | null;
  game_start_time?: string | null;
  status?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type PropPickRow = {
  id: number;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  game_start_time?: string | null;
  status?: string | null;
  player_name?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

function hasPregameWindow(gameStartTime: string | null | undefined) {
  if (!gameStartTime) return true;

  const start = new Date(gameStartTime);
  if (Number.isNaN(start.getTime())) return true;

  return start.getTime() > Date.now();
}

function buildPreviousActionMetaByPickId<
  T extends {
    pickId: number | null;
    gameLabel: string;
    boardBucket?: "top" | "value" | null;
    slotNumber?: number | null;
    playerName?: string;
    triggerReportLabel?: string | null;
    triggerReportTimestamp?: string | null;
  }
>(actions: T[]) {
  const byPickId = new Map<number, {
    boardBucket: "top" | "value" | null;
    slotNumber: number | null;
    triggerReportLabel: string | null;
    triggerReportTimestamp: string | null;
  }>();
  const byKey = new Map<string, {
    boardBucket: "top" | "value" | null;
    slotNumber: number | null;
    triggerReportLabel: string | null;
    triggerReportTimestamp: string | null;
  }>();

  for (const action of actions) {
    const meta = {
      boardBucket: action.boardBucket ?? null,
      slotNumber: action.slotNumber ?? null,
      triggerReportLabel: action.triggerReportLabel ?? null,
      triggerReportTimestamp: action.triggerReportTimestamp ?? null,
    };

    if (action.pickId !== null) {
      byPickId.set(action.pickId, meta);
    }

    const key = `${action.gameLabel}::${"playerName" in action ? action.playerName ?? "" : ""}`;
    byKey.set(key, meta);
  }

  return { byPickId, byKey };
}

type BoardSnapshotRow = {
  id: number;
  created_at?: string | null;
  locked_at?: string | null;
  market_scope?: string | null;
  market_type?: string | null;
  game_label?: string | null;
  player_name?: string | null;
  side?: string | null;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  status?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
};

const NBA_BOARD_RELEASE_CUTOFF_HOUR_ET = 9;
const NBA_BOARD_RELEASE_CUTOFF_LABEL = "9:00 AM ET";

function getEasternHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

function isAfterBoardReleaseCutoff(now = new Date()) {
  return getEasternHour(now) >= NBA_BOARD_RELEASE_CUTOFF_HOUR_ET;
}

function normalizeBoardText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildBoardIdentity(row: Pick<BoardSnapshotRow, "market_scope" | "game_label" | "player_name" | "market_type" | "side" | "line_taken">) {
  return [
    row.market_scope ?? "",
    row.game_label ?? "",
    row.player_name ?? "",
    row.market_type ?? "",
    row.side ?? "",
    row.line_taken ?? "",
  ].join("|");
}

function buildPropConflictKey(row: Pick<BoardSnapshotRow, "game_label" | "player_name">) {
  return `${normalizeBoardText(row.game_label)}|${normalizeBoardText(row.player_name)}`;
}

function compareCreatedAt(a: BoardSnapshotRow, b: BoardSnapshotRow) {
  return normalizeBoardText(a.created_at).localeCompare(normalizeBoardText(b.created_at));
}

function sortTeamTopRows(rows: BoardSnapshotRow[]) {
  return [...rows].sort(
    (a, b) =>
      (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99) ||
      (b.confidence_score ?? 0) - (a.confidence_score ?? 0) ||
      compareCreatedAt(a, b)
  );
}

function sortTeamValueRows(rows: BoardSnapshotRow[]) {
  return [...rows].sort(
    (a, b) =>
      (b.confidence_score ?? 0) - (a.confidence_score ?? 0) ||
      Math.abs(b.odds_taken ?? 0) - Math.abs(a.odds_taken ?? 0) ||
      compareCreatedAt(a, b)
  );
}

function sortPropRows(rows: BoardSnapshotRow[]) {
  return [...rows].sort(
    (a, b) =>
      Number(Boolean(b.locked_at)) - Number(Boolean(a.locked_at)) ||
      (b.confidence_score ?? 0) - (a.confidence_score ?? 0) ||
      compareCreatedAt(a, b)
  );
}

function selectUniquePropRows(rows: BoardSnapshotRow[], limit: number, blockedConflictKeys = new Set<string>()) {
  const selected: BoardSnapshotRow[] = [];
  const used = new Set(blockedConflictKeys);

  for (const row of rows) {
    const key = buildPropConflictKey(row);
    if (used.has(key)) continue;

    selected.push(row);
    used.add(key);
    if (selected.length >= limit) break;
  }

  return { rows: selected, conflictKeys: used };
}

function toBoardPick(
  row: BoardSnapshotRow,
  board: NbaBoardRecheckPick["board"],
  slotNumber: number
): NbaBoardRecheckPick {
  return {
    board,
    slotNumber,
    id: row.id ?? null,
    key: buildBoardIdentity(row),
    label: row.player_name ? `${row.player_name} - ${row.game_label ?? "NBA"}` : row.game_label ?? "NBA",
    marketType: row.market_type ?? null,
    side: row.side ?? null,
    lineTaken: row.line_taken ?? null,
    oddsTaken: row.odds_taken ?? null,
    status: row.status ?? null,
    playerName: row.player_name ?? null,
    projectedHomeScore: row.projected_home_score ?? null,
    projectedAwayScore: row.projected_away_score ?? null,
  };
}

async function captureNbaBoardSnapshot(supabase: ReturnType<typeof getSupabaseServer>, businessDate: string) {
  const { data } = await supabase
    .from("picks")
    .select(
      "id, created_at, locked_at, market_scope, market_type, game_label, player_name, side, line_taken, odds_taken, confidence_score, projected_home_score, projected_away_score, status, is_top_pick, top_pick_rank, notes"
    )
    .eq("pick_date", businessDate)
    .eq("sport", "NBA");

  const rows = (data ?? []) as BoardSnapshotRow[];
  const teamRows = rows.filter((row) => row.market_scope === "team");
  const propRows = rows.filter((row) => row.market_scope === "player_prop");

  const teamTop = sortTeamTopRows(teamRows.filter((row) => row.is_top_pick)).slice(0, 3);
  const teamValue = sortTeamValueRows(teamRows.filter((row) => row.notes === "best_value")).slice(0, 3);
  const propTopSelection = selectUniquePropRows(sortPropRows(propRows.filter((row) => row.is_top_pick)), 3);
  const propValue = selectUniquePropRows(
    sortPropRows(propRows.filter((row) => row.notes === "best_value")),
    3,
    propTopSelection.conflictKeys
  ).rows;

  return [
    ...teamTop.map((row, index) => toBoardPick(row, "team_top", index + 1)),
    ...teamValue.map((row, index) => toBoardPick(row, "team_value", index + 1)),
    ...propTopSelection.rows.map((row, index) => toBoardPick(row, "prop_top", index + 1)),
    ...propValue.map((row, index) => toBoardPick(row, "prop_value", index + 1)),
  ];
}

function sameBoardPick(before: NbaBoardRecheckPick | null, after: NbaBoardRecheckPick | null) {
  return Boolean(before && after && before.key === after.key);
}

function sameBoardDetails(before: NbaBoardRecheckPick, after: NbaBoardRecheckPick) {
  return (
    before.status === after.status &&
    before.lineTaken === after.lineTaken &&
    before.oddsTaken === after.oddsTaken &&
    before.projectedHomeScore === after.projectedHomeScore &&
    before.projectedAwayScore === after.projectedAwayScore
  );
}

function formatChangePick(pick: NbaBoardRecheckPick | null) {
  if (!pick) return "empty";
  return [pick.label, pick.side].filter(Boolean).join(" - ");
}

function diffNbaBoardSnapshots(before: NbaBoardRecheckPick[], after: NbaBoardRecheckPick[]) {
  const changes: NbaBoardRecheckChange[] = [];
  const boards: NbaBoardRecheckPick["board"][] = ["team_top", "team_value", "prop_top", "prop_value"];

  for (const board of boards) {
    for (let slotNumber = 1; slotNumber <= 3; slotNumber++) {
      const beforePick = before.find((pick) => pick.board === board && pick.slotNumber === slotNumber) ?? null;
      const afterPick = after.find((pick) => pick.board === board && pick.slotNumber === slotNumber) ?? null;

      if (!beforePick && !afterPick) continue;

      if (!beforePick && afterPick) {
        changes.push({
          board,
          slotNumber,
          changeType: "added",
          before: null,
          after: afterPick,
          summary: `Slot ${slotNumber} added ${formatChangePick(afterPick)}.`,
        });
        continue;
      }

      if (beforePick && !afterPick) {
        changes.push({
          board,
          slotNumber,
          changeType: "removed",
          before: beforePick,
          after: null,
          summary: `Slot ${slotNumber} removed ${formatChangePick(beforePick)}.`,
        });
        continue;
      }

      if (!sameBoardPick(beforePick, afterPick)) {
        changes.push({
          board,
          slotNumber,
          changeType: "changed",
          before: beforePick,
          after: afterPick,
          summary: `Slot ${slotNumber} changed from ${formatChangePick(beforePick)} to ${formatChangePick(afterPick)}.`,
        });
        continue;
      }

      if (beforePick && afterPick && !sameBoardDetails(beforePick, afterPick)) {
        changes.push({
          board,
          slotNumber,
          changeType: "updated",
          before: beforePick,
          after: afterPick,
          summary: `Slot ${slotNumber} kept ${formatChangePick(afterPick)}, but the line, odds, projection, or status changed.`,
        });
      }
    }
  }

  return changes;
}

function buildInjuryTriggerPlayers(syncData: NbaInjurySyncData) {
  const byKey = new Map<string, NbaInjuryTriggerPlayer>();

  const add = (player: NbaInjuryTriggerPlayer) => {
    const key = `${normalizeBoardText(player.team)}|${normalizeBoardText(player.playerName)}`;
    const existing = byKey.get(key);
    if (!existing || player.impactScore > existing.impactScore) {
      byKey.set(key, player);
    }
  };

  for (const change of syncData.significantChanges) {
    if (change.impactScore < 3) continue;
    add({
      team: change.team,
      playerName: change.playerName,
      reportStatus: change.toStatus,
      reason: change.reason,
      impactScore: change.impactScore,
    });
  }

  for (const action of [...syncData.teamActions, ...syncData.propActions]) {
    if (action.impactScore < 3) continue;
    add({
      team: "team" in action ? action.team : "",
      playerName: action.playerName,
      reportStatus: action.status,
      reason: action.reason,
      impactScore: action.impactScore,
    });
  }

  return [...byKey.values()].sort((a, b) => b.impactScore - a.impactScore);
}

function shouldRunInjuryBoardRecheck(syncData: NbaInjurySyncData, now: Date) {
  if (!isAfterBoardReleaseCutoff(now)) {
    return {
      shouldRun: false,
      reason: `Skipped board rebuild because it is before ${NBA_BOARD_RELEASE_CUTOFF_LABEL}.`,
    };
  }

  const hasMeaningfulStatusChange = syncData.significantChanges.some((change) => change.impactScore >= 3);
  const hasBoardAction = [
    ...syncData.teamActions.filter((action) => action.action === "remove" || action.action === "reinstate"),
    ...syncData.propActions.filter((action) => action.action === "void" || action.action === "reinstate"),
  ].length > 0;

  if (!hasMeaningfulStatusChange && !hasBoardAction) {
    return {
      shouldRun: false,
      reason: "Skipped board rebuild because no high-impact status change touched the NBA board.",
    };
  }

  return {
    shouldRun: true,
    reason:
      hasMeaningfulStatusChange && hasBoardAction
        ? "High-impact injury status changed and existing board picks needed review."
        : hasMeaningfulStatusChange
          ? "High-impact injury status changed after the morning board release."
          : "Existing board picks needed injury review after the morning board release.",
  };
}

async function callRecheckRoute(req: NextRequest, origin: string, path: string) {
  const headers: Record<string, string> = {};
  const secret = process.env.AUTO_SYNC_SECRET;
  const cookie = req.headers.get("cookie");

  if (secret) headers["x-auto-sync-secret"] = secret;
  else if (cookie) headers.cookie = cookie;

  const res = await fetch(`${origin}${path}`, {
    cache: "no-store",
    headers,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? `Route failed: ${path}`);
  }

  return data;
}

async function runNbaInjuryBoardRecheck(params: {
  req: NextRequest;
  origin: string;
  day: "today" | "tomorrow";
  businessDate: string;
  reportLabel: string | null;
  reason: string;
  startedAt: string;
  beforeSnapshot: NbaBoardRecheckPick[];
  triggerPlayers: NbaInjuryTriggerPlayer[];
  supabase: ReturnType<typeof getSupabaseServer>;
}): Promise<NbaInjuryBoardRecheck> {
  let teamSync: NbaInjuryBoardRecheck["teamSync"] = null;
  let propSync: NbaInjuryBoardRecheck["propSync"] = null;
  let error: string | null = null;

  try {
    const teamOdds = await callRecheckRoute(params.req, params.origin, `/api/sync-team-odds?day=${params.day}`);
    const teamBoard = await callRecheckRoute(params.req, params.origin, `/api/sync-top-picks?day=${params.day}`);
    teamSync = {
      ok: true,
      message: teamBoard?.message ?? teamOdds?.message ?? "NBA team board rechecked.",
      error: null,
    };
  } catch (syncError) {
    teamSync = {
      ok: false,
      message: null,
      error: syncError instanceof Error ? syncError.message : "NBA team recheck failed.",
    };
    error = teamSync.error;
  }

  try {
    const propBoard = await callRecheckRoute(params.req, params.origin, `/api/sync-props?day=${params.day}&propType=all`);
    propSync = {
      ok: true,
      message: propBoard?.message ?? "NBA prop board rechecked.",
      error: null,
    };
  } catch (syncError) {
    propSync = {
      ok: false,
      message: null,
      error: syncError instanceof Error ? syncError.message : "NBA prop recheck failed.",
    };
    error = [error, propSync.error].filter(Boolean).join(" | ") || null;
  }

  const afterSnapshot = await captureNbaBoardSnapshot(params.supabase, params.businessDate);

  return {
    triggered: true,
    ran: Boolean(teamSync?.ok || propSync?.ok),
    reason: params.reason,
    releaseCutoffLabel: NBA_BOARD_RELEASE_CUTOFF_LABEL,
    triggeredAt: params.startedAt,
    completedAt: new Date().toISOString(),
    reportLabel: params.reportLabel,
    teamSync,
    propSync,
    triggerPlayers: params.triggerPlayers,
    changes: diffNbaBoardSnapshots(params.beforeSnapshot, afterSnapshot),
    resultComparisons: [],
    outcomeUpdatedAt: null,
    error,
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = getRequestOrigin(req);
    const syncStartedAt = new Date();
    const report = await fetchOfficialNbaInjuryReport(day);
    const supabase = getSupabaseServer();
    const cacheKey = `nba_injury_report_${report.businessDate}`;

    const previous = (await getCachedData(cacheKey))?.data as NbaInjurySyncData | null;

    const { data: teamRows } = await supabase
      .from("picks")
      .select("id, game_label, home_team, away_team, market_type, side, game_start_time, status, is_top_pick, top_pick_rank, notes, created_at")
      .eq("pick_date", report.businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "team");

    const { data: propRows } = await supabase
      .from("picks")
      .select("id, game_label, home_team, away_team, game_start_time, status, player_name, is_top_pick, top_pick_rank, notes, created_at")
      .eq("pick_date", report.businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "player_prop");

    const syncData: NbaInjurySyncData = buildNbaInjurySyncData({
      businessDate: report.businessDate,
      reportUrl: report.reportUrl,
      reportLabel: report.reportLabel,
      reportTimestamp: report.reportTimestamp,
      previousRows: (previous?.rows ?? []) as NbaInjuryReportRow[],
      nextRows: report.rows,
      teamPicks: (teamRows ?? []) as TeamPickRow[],
      propPicks: (propRows ?? []) as PropPickRow[],
    });
    const boardSnapshotBefore = await captureNbaBoardSnapshot(supabase, report.businessDate);

    const previousTeamMeta = buildPreviousActionMetaByPickId(previous?.teamActions ?? []);
    const previousPropMeta = buildPreviousActionMetaByPickId(previous?.propActions ?? []);

    syncData.teamActions = syncData.teamActions.map((action) => {
      const prior =
        (action.pickId !== null ? previousTeamMeta.byPickId.get(action.pickId) : null) ??
        previousTeamMeta.byKey.get(`${action.gameLabel}::`);

      if (action.boardBucket !== null && action.slotNumber !== null) {
        return {
          ...action,
          triggerReportLabel: action.triggerReportLabel ?? prior?.triggerReportLabel ?? report.reportLabel,
          triggerReportTimestamp:
            action.triggerReportTimestamp ?? prior?.triggerReportTimestamp ?? report.reportTimestamp,
        };
      }

      if (!prior) {
        return action;
      }

      return {
        ...action,
        boardBucket: action.boardBucket ?? prior.boardBucket,
        slotNumber: action.slotNumber ?? prior.slotNumber,
        triggerReportLabel: action.triggerReportLabel ?? prior.triggerReportLabel ?? report.reportLabel,
        triggerReportTimestamp:
          action.triggerReportTimestamp ?? prior.triggerReportTimestamp ?? report.reportTimestamp,
      };
    });

    syncData.propActions = syncData.propActions.map((action) => {
      const prior =
        (action.pickId !== null ? previousPropMeta.byPickId.get(action.pickId) : null) ??
        previousPropMeta.byKey.get(`${action.gameLabel}::${action.playerName}`);

      if (action.boardBucket !== null && action.slotNumber !== null) {
        return {
          ...action,
          triggerReportLabel: action.triggerReportLabel ?? prior?.triggerReportLabel ?? report.reportLabel,
          triggerReportTimestamp:
            action.triggerReportTimestamp ?? prior?.triggerReportTimestamp ?? report.reportTimestamp,
        };
      }

      if (!prior) {
        return action;
      }

      return {
        ...action,
        boardBucket: action.boardBucket ?? prior.boardBucket,
        slotNumber: action.slotNumber ?? prior.slotNumber,
        triggerReportLabel: action.triggerReportLabel ?? prior.triggerReportLabel ?? report.reportLabel,
        triggerReportTimestamp:
          action.triggerReportTimestamp ?? prior.triggerReportTimestamp ?? report.reportTimestamp,
      };
    });

    const teamRowsById = new Map((teamRows ?? []).map((row) => [row.id, row as TeamPickRow]));
    const propRowsById = new Map((propRows ?? []).map((row) => [row.id, row as PropPickRow]));

    const voidPickIds = new Set<number>();
    const reinstatePickIds = new Set<number>();

    for (const action of syncData.teamActions) {
      if (action.pickId === null) continue;
      const pick = teamRowsById.get(action.pickId);
      if (!pick || !hasPregameWindow(pick.game_start_time)) continue;

      if (action.action === "remove") {
        if (pick.status === "pending" || pick.status === "voided" || !pick.status) {
          voidPickIds.add(action.pickId);
          reinstatePickIds.delete(action.pickId);
        }
      } else if (action.action === "reinstate" && pick.status === "voided") {
        reinstatePickIds.add(action.pickId);
        voidPickIds.delete(action.pickId);
      }
    }

    for (const action of syncData.propActions) {
      if (action.pickId === null) continue;
      const pick = propRowsById.get(action.pickId);
      if (!pick || !hasPregameWindow(pick.game_start_time)) continue;

      if (action.action === "void") {
        if (pick.status === "pending" || pick.status === "voided" || !pick.status) {
          voidPickIds.add(action.pickId);
          reinstatePickIds.delete(action.pickId);
        }
      } else if (action.action === "reinstate" && pick.status === "voided") {
        reinstatePickIds.add(action.pickId);
        voidPickIds.delete(action.pickId);
      }
    }

    if (voidPickIds.size > 0) {
      await supabase
        .from("picks")
        .update({
          status: "voided",
          final_score: "Voided before tip",
          final_stat: null,
          units_result: 0,
          graded_at: new Date().toISOString(),
        })
        .in("id", Array.from(voidPickIds));
    }

    if (reinstatePickIds.size > 0) {
      await supabase
        .from("picks")
        .update({
          status: "pending",
          final_score: null,
          final_stat: null,
          units_result: null,
          graded_at: null,
        })
        .in("id", Array.from(reinstatePickIds));
    }

    await setCachedData(cacheKey, syncData);
    await setCachedData(`nba_injury_report_${day}`, syncData);

    const recheckDecision = shouldRunInjuryBoardRecheck(syncData, syncStartedAt);
    if (req.nextUrl.searchParams.get("recheckBoard") !== "0" && recheckDecision.shouldRun) {
      syncData.boardRecheck = await runNbaInjuryBoardRecheck({
        req,
        origin,
        day,
        businessDate: report.businessDate,
        reportLabel: report.reportLabel,
        reason: recheckDecision.reason,
        startedAt: syncStartedAt.toISOString(),
        beforeSnapshot: boardSnapshotBefore,
        triggerPlayers: buildInjuryTriggerPlayers(syncData),
        supabase,
      });

      await setCachedData(cacheKey, syncData);
      await setCachedData(`nba_injury_report_${day}`, syncData);
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate: report.businessDate,
      reportLabel: report.reportLabel,
      message: `Synced NBA injuries for ${report.businessDate}`,
      teamRemovals: syncData.teamActions.filter((action) => action.action === "remove").length,
      propVoids: syncData.propActions.filter((action) => action.action === "void").length,
      voidedPicks: voidPickIds.size,
      reinstatedPicks: reinstatePickIds.size,
      changes: syncData.significantChanges.length,
      boardRecheck: syncData.boardRecheck ?? null,
      data: syncData,
    }, undefined, { fallbackPath: "/dashboard" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/dashboard" }
    );
  }
}
