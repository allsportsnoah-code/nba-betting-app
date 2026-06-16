import { NextRequest, NextResponse } from "next/server";
import { captureMlbHistorySnapshot } from "@/lib/mlbHistorySnapshot";
import { getCachedData } from "@/lib/cache";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import { getMlbPropMarketTypes, MLB_PROP_MARKET_MAP, type MlbPropType } from "@/lib/mlbPropModel";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { capturePublicFreePickHistory } from "@/lib/publicFreePickHistory";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { getSupabaseServer } from "@/lib/supabaseServer";

type SavedPropCoverageRow = {
  external_event_id?: string | null;
  market_type?: string | null;
};

type CachedPropDiagnostics = {
  error?: string | null;
  marketTypes?: string[];
  requestedMarketTypes?: string[];
};

function buildForwardHeaders(req: NextRequest) {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  const autoSecret = req.headers.get("x-auto-sync-secret") ?? req.nextUrl.searchParams.get("syncSecret");

  if (cookie) headers.cookie = cookie;
  if (autoSecret) headers["x-auto-sync-secret"] = autoSecret;

  return headers;
}

function parseTargetMarketTypes(param: string | null): MlbPropType[] {
  if (!param) return getMlbPropMarketTypes(true);

  return param
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is MlbPropType => value in MLB_PROP_MARKET_MAP);
}

function getGameLabel(game: MlbOddsGame) {
  return `${game.away_team} @ ${game.home_team}`;
}

function hasGameStarted(game: MlbOddsGame, now: Date) {
  const gameStart = new Date(game.commence_time);
  return !Number.isNaN(gameStart.getTime()) && gameStart <= now;
}

async function getSavedMarketTypesByEvent(businessDate: string, eventIds: string[]) {
  const byEvent = new Map<string, Set<string>>();

  if (eventIds.length === 0) return byEvent;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("external_event_id, market_type")
    .eq("pick_date", businessDate)
    .eq("sport", "MLB")
    .eq("market_scope", "player_prop")
    .in("external_event_id", eventIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as SavedPropCoverageRow[]) {
    if (!row.external_event_id || !row.market_type) continue;
    const existing = byEvent.get(row.external_event_id) ?? new Set<string>();
    existing.add(row.market_type);
    byEvent.set(row.external_event_id, existing);
  }

  return byEvent;
}

async function getMissingMarketTypes(params: {
  businessDate: string;
  eventId: string;
  targetMarketTypes: MlbPropType[];
  savedMarketTypes: Set<string>;
}) {
  const coveredMarketTypes = new Set(params.savedMarketTypes);
  const diagnosticsRow = await getCachedData(`mlb_prop_diag_${params.businessDate}_${params.eventId}`);
  const diagnostics = (diagnosticsRow?.data as CachedPropDiagnostics | null) ?? null;

  if (diagnostics && !diagnostics.error) {
    for (const marketType of diagnostics.requestedMarketTypes ?? diagnostics.marketTypes ?? []) {
      coveredMarketTypes.add(marketType);
    }
  }

  return params.targetMarketTypes.filter((marketType) => !coveredMarketTypes.has(marketType));
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const includeShadowMarkets =
      req.nextUrl.searchParams.get("includeShadowMarkets") === "1" ||
      req.nextUrl.searchParams.get("includeShadowMarkets") === "true";
    const dryRun =
      req.nextUrl.searchParams.get("dryRun") === "1" ||
      req.nextUrl.searchParams.get("dryRun") === "true";
    const marketTypesParam = req.nextUrl.searchParams.get("marketTypes");
    const targetMarketTypes = parseTargetMarketTypes(marketTypesParam);
    const origin = getRequestOrigin(req);
    const headers = buildForwardHeaders(req);
    let resolvedOdds = await getResolvedMlbOddsCache(day);
    let cachedOdds =
      (resolvedOdds.active as { businessDate?: string; data?: MlbOddsGame[] } | null) ?? null;

    if (!cachedOdds?.businessDate) {
      const oddsRes = await fetch(`${origin}/api/sync-mlb-odds?day=${day}`, {
        cache: "no-store",
        headers,
      });
      const oddsJson = await oddsRes.json();

      if (!oddsRes.ok || !oddsJson.ok) {
        return apiJsonOrNativeRedirect(
          req,
          { ok: false, error: oddsJson.error ?? "Failed to sync MLB odds before props sync." },
          { status: 500 },
          { fallbackPath: "/mlb" }
        );
      }

      resolvedOdds = await getResolvedMlbOddsCache(day);
      cachedOdds =
        (resolvedOdds.active as { businessDate?: string; data?: MlbOddsGame[] } | null) ?? null;
    }

    if (!cachedOdds?.businessDate) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: `No cached MLB odds found for betting day ${resolvedOdds.expectedBusinessDate}.`,
        },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    if (targetMarketTypes.length === 0) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: "No valid MLB prop markets requested." },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    const games = cachedOdds.data ?? [];
    const results: Array<{
      eventId: string;
      gameLabel: string;
      syncedCount?: number;
      skipped?: boolean;
      skipReason?: string;
      missingMarketTypes?: string[];
      error?: string;
    }> = [];
    let syncedGames = 0;
    let skippedGames = 0;
    let alreadyCompleteGames = 0;
    let startedGames = 0;
    let pendingMissingGames = 0;
    const now = new Date();
    const savedMarketTypesByEvent = await getSavedMarketTypesByEvent(
      cachedOdds.businessDate,
      games.map((game) => game.id).filter(Boolean)
    );

    for (const game of games) {
      const gameLabel = getGameLabel(game);

      if (hasGameStarted(game, now)) {
        skippedGames += 1;
        startedGames += 1;
        results.push({
          eventId: game.id,
          gameLabel,
          skipped: true,
          skipReason: "already_started",
          error: "This game already started, so props are locked.",
        });
        continue;
      }

      const missingMarketTypes = await getMissingMarketTypes({
        businessDate: cachedOdds.businessDate,
        eventId: game.id,
        targetMarketTypes,
        savedMarketTypes: savedMarketTypesByEvent.get(game.id) ?? new Set<string>(),
      });

      if (missingMarketTypes.length === 0) {
        skippedGames += 1;
        alreadyCompleteGames += 1;
        results.push({
          eventId: game.id,
          gameLabel,
          skipped: true,
          skipReason: "already_synced",
          missingMarketTypes: [],
        });
        continue;
      }

      if (dryRun) {
        pendingMissingGames += 1;
        results.push({
          eventId: game.id,
          gameLabel,
          skipped: true,
          skipReason: "dry_run_missing_props",
          missingMarketTypes,
        });
        continue;
      }

      const syncUrl = new URL(`${origin}/api/sync-mlb-props`);
      syncUrl.searchParams.set("day", day);
      syncUrl.searchParams.set("eventId", game.id);
      syncUrl.searchParams.set("marketTypes", missingMarketTypes.join(","));
      if (includeShadowMarkets) {
        syncUrl.searchParams.set("includeShadowMarkets", "1");
      }

      const res = await fetch(
        syncUrl.toString(),
        {
          cache: "no-store",
          headers,
        }
      );
      const json = await res.json();

      if (res.ok && json.ok) {
        syncedGames += 1;
        results.push({
          eventId: game.id,
          gameLabel: json.gameLabel ?? gameLabel,
          syncedCount: json.syncedCount ?? 0,
          missingMarketTypes,
        });
        continue;
      }

      if ((json?.error ?? "").includes("already started")) {
        skippedGames += 1;
        results.push({
          eventId: game.id,
          gameLabel,
          skipped: true,
          skipReason: "already_started",
          missingMarketTypes,
          error: json.error,
        });
        continue;
      }

      results.push({
        eventId: game.id,
        gameLabel,
        missingMarketTypes,
        error: json?.error ?? "Failed to sync props for this game.",
      });
    }

    const failedGames = results.filter((result) => Boolean(result.error) && !result.skipped).length;
    const zeroSyncedGames = results.filter(
      (result) => !result.error && !result.skipped && (result.syncedCount ?? 0) === 0
    ).length;
    const message =
      failedGames > 0
        ? `Checked ${games.length} MLB games. Synced missing props for ${syncedGames}, skipped ${skippedGames}, and ${failedGames} failed${zeroSyncedGames > 0 ? `, with ${zeroSyncedGames} returning no saved props` : ""}.`
        : dryRun
        ? `Checked ${games.length} MLB games. ${pendingMissingGames} would sync missing props, ${alreadyCompleteGames} already complete, ${startedGames} already started.`
        : zeroSyncedGames > 0
        ? `Checked ${games.length} MLB games. Synced missing props for ${syncedGames}, skipped ${skippedGames}. ${zeroSyncedGames} returned no saved props.`
        : `Checked ${games.length} MLB games. Synced missing props for ${syncedGames}, skipped ${skippedGames}.`;

    if (syncedGames === 0 && failedGames > 0) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: message,
          businessDate: cachedOdds.businessDate,
          dryRun,
          syncedGames,
          skippedGames,
          alreadyCompleteGames,
          startedGames,
          pendingMissingGames,
          failedGames,
          zeroSyncedGames,
          totalGames: games.length,
          data: results,
        },
        { status: 502 },
        { fallbackPath: "/mlb" }
      );
    }

    if (!dryRun) {
      await captureMlbHistorySnapshot(cachedOdds.businessDate);
      await capturePublicFreePickHistory(cachedOdds.businessDate, { force: true });
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate: cachedOdds.businessDate,
      dryRun,
      syncedGames,
      skippedGames,
      alreadyCompleteGames,
      startedGames,
      pendingMissingGames,
      failedGames,
      zeroSyncedGames,
      totalGames: games.length,
      message,
      data: results,
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
