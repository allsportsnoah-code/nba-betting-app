import { NextRequest, NextResponse } from "next/server";
import { setMlbPropAuditEventSnapshot } from "@/lib/futureAudit";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getMlbDoubleheaderGameLabels } from "@/lib/mlbDoubleheader";
import { buildMlbLearningProfile, type MlbLearningProfile } from "@/lib/mlbLearning";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import {
  getMlbPropMarketTypes,
  MLB_PROP_MARKET_MAP,
  type MlbPropCandidate,
  type MlbPropType,
} from "@/lib/mlbPropModel";
import {
  propBoardKey as propKey,
  selectMlbPropBoardCandidates,
  toSavedPropBoardCandidate,
} from "@/lib/mlbPropBoard";
import { setCachedData } from "@/lib/cache";
import { getRequestOrigin } from "@/lib/requestOrigin";

type ExistingPropRow = {
  id: number;
  side: string;
  line_taken: number | null;
  player_name: string | null;
  market_type: string | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  projected_line?: number | null;
  market_line?: number | null;
  game_start_time?: string | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  locked_at?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
};

type SavedPropSyncRow = Partial<ExistingPropRow> & {
  id: number;
};

type PropSyncDiagnostics = {
  offeredCount?: number;
  rosterMatchedCount?: number;
  projectedCount?: number;
  passedFilterCount?: number;
  savedUniqueCount?: number;
  syncedCount?: number;
  gameLabel?: string;
  marketTypes?: string[];
  requestedMarketTypes?: string[];
  updatedAt?: string;
  error?: string | null;
};

function parseRequestedMarketTypes(param: string | null): MlbPropType[] {
  if (!param) return getMlbPropMarketTypes(true);

  return param
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is MlbPropType => value in MLB_PROP_MARKET_MAP);
}

async function splitLockedRows(
  rows: ExistingPropRow[],
  now: Date,
  supabase: ReturnType<typeof getSupabaseServer>
) {
  const lockedRows: ExistingPropRow[] = [];
  const unlockedRows: ExistingPropRow[] = [];

  for (const row of rows) {
    const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
    const shouldLock = Boolean(gameStart && gameStart <= now);

    if (shouldLock && !row.locked_at) {
      await supabase.from("picks").update({ locked_at: now.toISOString() }).eq("id", row.id);
      row.locked_at = now.toISOString();
    }

    if (row.locked_at || shouldLock) lockedRows.push(row);
    else unlockedRows.push(row);
  }

  return { lockedRows, unlockedRows };
}

function assignOpenTopRanks(
  lockedRows: ExistingPropRow[],
  candidateKeys: string[]
) {
  const occupiedRanks = new Set(
    lockedRows
      .map((row) => row.top_pick_rank)
      .filter((rank): rank is number => typeof rank === "number" && rank >= 1 && rank <= 3)
  );
  const rankByKey = new Map<string, number>();
  let nextRank = 1;

  for (const key of candidateKeys) {
    while (occupiedRanks.has(nextRank) && nextRank <= 3) {
      nextRank += 1;
    }

    if (nextRank > 3) break;
    rankByKey.set(key, nextRank);
    occupiedRanks.add(nextRank);
    nextRank += 1;
  }

  return rankByKey;
}

function getFriendlyPropSyncError(error: string | null | undefined, details: string | null | undefined) {
  if ((details ?? "").includes("OUT_OF_USAGE_CREDITS")) {
    return "Props API usage credits are exhausted right now.";
  }

  if ((error ?? "").includes("already started")) {
    return "This game already started, so props are locked.";
  }

  return error ?? "Failed to load MLB props.";
}

async function cachePropDiagnostics(
  businessDate: string | null | undefined,
  eventId: string,
  diagnostics: PropSyncDiagnostics
) {
  if (!businessDate) return;
  await setCachedData(`mlb_prop_diag_${businessDate}_${eventId}`, diagnostics);
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const eventId = req.nextUrl.searchParams.get("eventId");
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const includeShadowMarkets =
      req.nextUrl.searchParams.get("includeShadowMarkets") === "1" ||
      req.nextUrl.searchParams.get("includeShadowMarkets") === "true";
    const marketTypesParam = req.nextUrl.searchParams.get("marketTypes");
    const origin = getRequestOrigin(req);
    const requestedMarketTypes = parseRequestedMarketTypes(marketTypesParam);

    if (!eventId) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "Missing eventId" }, { status: 400 }, { fallbackPath: "/mlb" });
    }

    if (requestedMarketTypes.length === 0) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "No valid MLB prop markets requested." }, { status: 400 }, { fallbackPath: "/mlb" });
    }

    const resolvedOdds = await getResolvedMlbOddsCache(day);
    const cachedOdds =
      (resolvedOdds.active as { businessDate?: string; data?: MlbOddsGame[]; learning?: MlbLearningProfile } | null) ?? null;
    const cachedGame = (cachedOdds?.data ?? []).find((game) => game.id === eventId);
    const businessDate = cachedOdds?.businessDate ?? null;
    const fallbackGameLabel = cachedGame ? `${cachedGame.away_team} @ ${cachedGame.home_team}` : undefined;
    const now = new Date();
    const cachedGameStart = cachedGame?.commence_time ? new Date(cachedGame.commence_time) : null;

    if (cachedGameStart && !Number.isNaN(cachedGameStart.getTime()) && cachedGameStart <= now) {
      const lockedError = "This game already started, so props are locked.";
      await cachePropDiagnostics(businessDate, eventId, {
        syncedCount: 0,
        gameLabel: fallbackGameLabel,
        marketTypes: requestedMarketTypes,
        requestedMarketTypes,
        updatedAt: now.toISOString(),
        error: lockedError,
      });

      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: lockedError,
          businessDate,
          eventId,
          gameLabel: fallbackGameLabel,
        },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    const propsUrl = new URL(`${origin}/api/mlb-props`);
    propsUrl.searchParams.set("day", day);
    propsUrl.searchParams.set("eventId", eventId);
    if (marketTypesParam) {
      propsUrl.searchParams.set("marketTypes", marketTypesParam);
    }
    if (includeShadowMarkets) {
      propsUrl.searchParams.set("includeShadowMarkets", "1");
    }

    const propsRes = await fetch(propsUrl.toString(), {
      cache: "no-store",
      headers: req.headers.get("x-auto-sync-secret")
        ? { "x-auto-sync-secret": req.headers.get("x-auto-sync-secret") as string }
        : {},
    });

    const props = await propsRes.json();
    if (!propsRes.ok || !props.ok) {
      const friendlyError = getFriendlyPropSyncError(props.error, props.details);
      await cachePropDiagnostics(businessDate, eventId, {
        syncedCount: 0,
        gameLabel: fallbackGameLabel,
        marketTypes: requestedMarketTypes,
        requestedMarketTypes,
        updatedAt: new Date().toISOString(),
        error: friendlyError,
      });
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: friendlyError,
          details: props.details ?? null,
          businessDate,
          eventId,
          gameLabel: fallbackGameLabel,
        },
        { status: propsRes.status >= 400 ? propsRes.status : 500 },
        { fallbackPath: "/mlb" }
      );
    }

    const supabase = getSupabaseServer();
    const learningProfile = cachedOdds?.learning ?? await buildMlbLearningProfile();
    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", props.businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "player_prop")
      .eq("external_event_id", eventId);

    if (existingError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: existingError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const rows = (existingRows ?? []) as ExistingPropRow[];
    const { lockedRows, unlockedRows } = await splitLockedRows(rows, now, supabase);
    const existingByKey = new Map(rows.map((row) => [propKey(row), row]));

    const gameStart = props.data?.[0]?.commence_time ? new Date(props.data[0].commence_time) : null;
    if (gameStart && gameStart <= now) {
      const lockedError = "This game already started, so props are locked.";
      await cachePropDiagnostics(props.businessDate, eventId, {
        ...(props.diagnostics ?? {}),
        syncedCount: lockedRows.length,
        gameLabel: props.gameLabel ?? fallbackGameLabel,
        updatedAt: now.toISOString(),
        error: lockedError,
      });
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: lockedError, businessDate: props.businessDate, eventId, gameLabel: props.gameLabel ?? fallbackGameLabel },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    const candidates = ((props.data ?? []) as MlbPropCandidate[]).filter((candidate) => {
      if (!candidate.commence_time) return true;
      return new Date(candidate.commence_time) > now;
    });
    const targetMarketTypes = new Set(
      (((props.marketTypes ?? []) as string[]).filter(Boolean))
    );
    await setMlbPropAuditEventSnapshot({
      pickDate: props.businessDate,
      eventId,
      gameLabel: props.gameLabel ?? fallbackGameLabel ?? `event:${eventId}`,
      diagnostics: props.diagnostics ?? null,
      rows: (props.auditRows ?? []) as any[],
    });
    const candidateKeys = new Set(candidates.map((candidate) => propKey(candidate)));
    const saved: SavedPropSyncRow[] = [];

    for (const row of unlockedRows) {
      const key = propKey(row);
      const rowMarketType = String(row.market_type ?? "");
      if (targetMarketTypes.has(rowMarketType) && !candidateKeys.has(key)) {
        await supabase.from("picks").delete().eq("id", row.id);
      }
    }

    saved.push(
      ...lockedRows.map((row) => ({
        id: row.id,
        player_name: row.player_name,
        market_type: row.market_type,
        side: row.side,
        locked_at: row.locked_at,
      }))
    );

    for (const candidate of candidates) {
      const key = propKey(candidate);
      const existing = existingByKey.get(key);
      if (existing?.locked_at) continue;

      const payload = {
        pick_date: props.businessDate,
        sport: "MLB",
        market_scope: "player_prop",
        market_type: candidate.market_type,
        game_label: candidate.game_label,
        home_team: candidate.home_team,
        away_team: candidate.away_team,
        player_name: `${candidate.player_name} - ${candidate.player_team_short}`,
        sportsbook: "DraftKings",
        side: candidate.side,
        line_taken: candidate.line,
        odds_taken: candidate.odds_taken,
        stake_units: 1,
        confidence_score: candidate.confidence_score,
        projected_line: candidate.projected_line,
        projected_home_score: null,
        projected_away_score: null,
        market_line: candidate.market_line,
        edge: candidate.edge,
        edge_label: [
          candidate.edge_label,
          candidate.reason_labels?.length ? `Reasons: ${candidate.reason_labels.join(", ")}` : null,
          candidate.risk_flags?.length ? `Watch: ${candidate.risk_flags.join(", ")}` : null,
          candidate.market_health_note ? `Learning: ${candidate.market_health_note}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
        is_top_pick: false,
        top_pick_rank: null,
        notes: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.commence_time,
        external_event_id: candidate.external_event_id,
        prop_stat_key: candidate.stat_key,
      };

      if (existing) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single();

        if (updated) saved.push(updated);
      } else {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select("*")
          .single();

        if (inserted) saved.push(inserted);
      }
    }

    const { data: allSlateRows, error: allSlateRowsError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", props.businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "player_prop");

    if (allSlateRowsError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: allSlateRowsError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const globalRows = (allSlateRows ?? []) as ExistingPropRow[];
    const { lockedRows: lockedSlateRows, unlockedRows: unlockedSlateRows } = await splitLockedRows(
      globalRows,
      now,
      supabase
    );
    const lockedTopRows = lockedSlateRows
      .filter((row) => row.is_top_pick)
      .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
    const lockedBestValueRows = lockedSlateRows.filter((row) => row.notes === "best_value");
    const globalCandidates = unlockedSlateRows.map(toSavedPropBoardCandidate);
    const doubleheaderGameLabels = getMlbDoubleheaderGameLabels(
      (cachedOdds?.data ?? []).map((game) => ({
        external_event_id: game.id,
        game_label: `${game.away_team} @ ${game.home_team}`,
        game_start_time: game.commence_time,
      }))
    );
    const { topCandidates: globalTopCandidates, bestValueCandidates: globalBestValueCandidates } =
      selectMlbPropBoardCandidates(globalCandidates, learningProfile, 2, doubleheaderGameLabels);
    const selectedTopCandidates = globalTopCandidates.slice(0, Math.max(0, 3 - lockedTopRows.length));
    const selectedValueCandidates = globalBestValueCandidates.slice(
      0,
      Math.max(0, 3 - lockedBestValueRows.length)
    );
    const globalTopKeys = new Set(selectedTopCandidates.map((candidate) => propKey(candidate)));
    const globalValueKeys = new Set(selectedValueCandidates.map((candidate) => propKey(candidate)));
    const topRanksByKey = assignOpenTopRanks(
      lockedTopRows,
      selectedTopCandidates.map((candidate) => propKey(candidate))
    );

    for (const row of unlockedSlateRows) {
      const key = propKey(row);
      await supabase
        .from("picks")
        .update({
          is_top_pick: globalTopKeys.has(key),
          top_pick_rank: globalTopKeys.has(key) ? topRanksByKey.get(key) ?? null : null,
          notes: globalValueKeys.has(key) ? "best_value" : null,
        })
        .eq("id", row.id);
    }

    await setCachedData(`mlb_prop_diag_${props.businessDate}_${eventId}`, {
      ...(props.diagnostics ?? {}),
      marketTypes: ((props.marketTypes ?? requestedMarketTypes) as string[]).filter(Boolean),
      requestedMarketTypes,
      syncedCount: saved.length,
      gameLabel: props.gameLabel,
      updatedAt: new Date().toISOString(),
      error: null,
    });

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate: props.businessDate,
      eventId,
      gameLabel: props.gameLabel,
      message: `Synced MLB props for ${props.gameLabel ?? fallbackGameLabel ?? "game"}`,
      syncedCount: saved.length,
      marketTypes: ((props.marketTypes ?? requestedMarketTypes) as string[]).filter(Boolean),
      diagnostics: props.diagnostics ?? null,
      data: saved,
    }, undefined, { fallbackPath: "/mlb" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/mlb" }
    );
  }
}
