import { NextRequest } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";
import {
  getSoccerOddsCacheKey,
  normalizeSoccerCompetition,
  type SoccerOddsCacheDay,
} from "@/lib/soccerOddsCache";
import type { SoccerOddsGame } from "@/lib/soccerModel";

function mergeLockedStartedGames(previousGames: SoccerOddsGame[], nextGames: SoccerOddsGame[], now: Date) {
  const previousById = new Map(previousGames.map((game) => [game.id, game]));

  return nextGames.map((game) => {
    const previous = previousById.get(game.id);
    if (!previous) return game;

    const gameStart = new Date(previous.commence_time);
    if (Number.isNaN(gameStart.getTime())) return game;

    return gameStart <= now ? previous : game;
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const competition = normalizeSoccerCompetition(req.nextUrl.searchParams.get("competition"));
    const origin = getRequestOrigin(req);
    const oddsUrl = new URL(`${origin}/api/odds`);
    oddsUrl.searchParams.set("day", day);
    oddsUrl.searchParams.set("sport", "SOCCER");
    oddsUrl.searchParams.set("competition", competition);

    const oddsRes = await fetch(oddsUrl.toString(), { cache: "no-store" });
    const odds = await oddsRes.json();

    if (!odds.ok) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: odds.error ?? "Failed to sync soccer odds." },
        { status: 500 },
        { fallbackPath: "/soccer" }
      );
    }

    const cacheKey = getSoccerOddsCacheKey(competition, day as SoccerOddsCacheDay);
    const previousCacheRow = await getCachedData(cacheKey);
    const previousCache = (previousCacheRow?.data as { data?: SoccerOddsGame[] } | null) ?? null;
    const mergedGames = mergeLockedStartedGames(
      previousCache?.data ?? [],
      (odds.data ?? []) as SoccerOddsGame[],
      new Date()
    );
    const gameCount = mergedGames.length;

    await setCachedData(cacheKey, {
      ...odds,
      day,
      competition,
      data: mergedGames,
      cachedAt: new Date().toISOString(),
    });

    if (gameCount === 0) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: true,
          skipped: true,
          message: `No ${competition === "world_cup" ? "World Cup" : "MLS"} games found for ${odds.businessDate}.`,
          businessDate: odds.businessDate,
          competition,
          gameCount,
        },
        undefined,
        { fallbackPath: "/soccer" }
      );
    }

    const forwardHeaders: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const autoSecret = req.headers.get("x-auto-sync-secret");
    if (cookie) forwardHeaders.cookie = cookie;
    if (autoSecret) forwardHeaders["x-auto-sync-secret"] = autoSecret;

    const topPickUrl = new URL(`${origin}/api/sync-soccer-top-picks`);
    topPickUrl.searchParams.set("day", day);
    topPickUrl.searchParams.set("competition", competition);
    const topPickRes = await fetch(topPickUrl.toString(), {
      cache: "no-store",
      headers: forwardHeaders,
    });
    const topPickJson = await topPickRes.json();

    if (!topPickRes.ok || !topPickJson.ok) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: topPickJson.error ?? "Soccer odds synced, but top-pick sync failed.",
        },
        { status: 500 },
        { fallbackPath: "/soccer" }
      );
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("sync-soccer-odds");
    }

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        message: `Cached ${competition === "world_cup" ? "World Cup" : "MLS"} soccer odds and refreshed picks for ${odds.businessDate}`,
        businessDate: odds.businessDate,
        competition,
        gameCount,
        topPicks: topPickJson.data ?? [],
      },
      undefined,
      { fallbackPath: "/soccer" }
    );
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/soccer" }
    );
  }
}
