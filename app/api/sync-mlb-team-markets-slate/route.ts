import { NextRequest } from "next/server";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";

function buildForwardHeaders(req: NextRequest) {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  const autoSecret = req.headers.get("x-auto-sync-secret") ?? req.nextUrl.searchParams.get("syncSecret");

  if (cookie) headers.cookie = cookie;
  if (autoSecret) headers["x-auto-sync-secret"] = autoSecret;

  return headers;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const marketTypes = req.nextUrl.searchParams.get("marketTypes");
    const origin = getRequestOrigin(req);
    const headers = buildForwardHeaders(req);
    const resolvedOdds = await getResolvedMlbOddsCache(day);
    const cachedOdds =
      (resolvedOdds.active as { businessDate?: string; data?: MlbOddsGame[] } | null) ?? null;

    if (!cachedOdds?.businessDate) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: `No cached MLB odds found for betting day ${resolvedOdds.expectedBusinessDate}. Sync MLB odds first.`,
        },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    const games = cachedOdds.data ?? [];
    const results: Array<{ eventId: string; gameLabel: string; syncedCount?: number; skipped?: boolean; error?: string }> = [];
    let syncedGames = 0;
    let skippedGames = 0;

    for (const game of games) {
      const syncUrl = new URL(`${origin}/api/sync-mlb-team-markets`);
      syncUrl.searchParams.set("day", day);
      syncUrl.searchParams.set("eventId", game.id);
      if (marketTypes) {
        syncUrl.searchParams.set("marketTypes", marketTypes);
      }

      const res = await fetch(syncUrl.toString(), {
        cache: "no-store",
        headers,
      });
      const json = await res.json();

      if (res.ok && json.ok) {
        syncedGames += 1;
        results.push({
          eventId: game.id,
          gameLabel: json.gameLabel ?? `${game.away_team} @ ${game.home_team}`,
          syncedCount: json.syncedCount ?? 0,
        });
        continue;
      }

      if ((json?.error ?? "").includes("already started")) {
        skippedGames += 1;
        results.push({
          eventId: game.id,
          gameLabel: `${game.away_team} @ ${game.home_team}`,
          skipped: true,
          error: json.error,
        });
        continue;
      }

      results.push({
        eventId: game.id,
        gameLabel: `${game.away_team} @ ${game.home_team}`,
        error: json?.error ?? "Failed to sync team markets for this game.",
      });
    }

    const failedGames = results.filter((result) => Boolean(result.error) && !result.skipped).length;
    const zeroSyncedGames = results.filter(
      (result) => !result.error && !result.skipped && (result.syncedCount ?? 0) === 0
    ).length;
    const message =
      failedGames > 0
        ? `Synced team markets for ${syncedGames} games, ${failedGames} failed${zeroSyncedGames > 0 ? `, and ${zeroSyncedGames} returned no saved markets` : ""}.`
        : zeroSyncedGames > 0
        ? `Synced team markets for ${syncedGames} games. ${zeroSyncedGames} returned no saved markets.`
        : `Synced team markets for ${syncedGames} games.`;

    return apiJsonOrNativeRedirect(req, {
      ok: failedGames === 0 || syncedGames > 0,
      businessDate: cachedOdds.businessDate,
      syncedGames,
      skippedGames,
      failedGames,
      zeroSyncedGames,
      totalGames: games.length,
      message,
      data: results,
    }, failedGames > 0 && syncedGames === 0 ? { status: 502 } : undefined, { fallbackPath: "/mlb" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/mlb" }
    );
  }
}
