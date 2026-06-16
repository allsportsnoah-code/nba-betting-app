import { NextRequest, NextResponse } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";
import { fetchMlbGameContext } from "@/lib/mlbContext";
import { buildMlbLearningProfile } from "@/lib/mlbLearning";
import { mlbTeamRatings } from "@/lib/mlbRatings";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { getRequestOrigin } from "@/lib/requestOrigin";

function mergeLockedStartedGames(
  previousGames: MlbOddsGame[],
  nextGames: MlbOddsGame[],
  now: Date
) {
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

    const dayParam = req.nextUrl.searchParams.get("day");
    const includeShadowMarkets =
      req.nextUrl.searchParams.get("includeShadowMarkets") === "1" ||
      req.nextUrl.searchParams.get("includeShadowMarkets") === "true";
    const origin = getRequestOrigin(req);
    const oddsUrl = new URL(`${origin}/api/odds`);
    oddsUrl.searchParams.set("day", dayParam ?? "today");
    oddsUrl.searchParams.set("sport", "MLB");
    if (includeShadowMarkets) {
      oddsUrl.searchParams.set("includeShadowMarkets", "1");
    }

    const oddsRes = await fetch(oddsUrl.toString(), {
      cache: "no-store",
    });

    const odds = await oddsRes.json();

    if (!odds.ok) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: odds.error }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const formattedDate = odds.businessDate;
    const previousCacheRow = await getCachedData(`mlb_odds_${dayParam ?? "today"}`);
    const previousCache =
      (previousCacheRow?.data as { data?: MlbOddsGame[] } | null) ?? null;
    const mergedGames = mergeLockedStartedGames(
      previousCache?.data ?? [],
      (odds.data ?? []) as MlbOddsGame[],
      new Date()
    );
    const [context, learning] = await Promise.all([
      fetchMlbGameContext({
        businessDate: formattedDate,
        teamPitchingRatings: mlbTeamRatings,
      }),
      buildMlbLearningProfile(),
    ]);

    await setCachedData(`mlb_odds_${dayParam ?? "today"}`, {
      ...odds,
      businessDate: formattedDate,
      data: mergedGames,
      context,
      learning,
    });

    const forwardHeaders: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const autoSecret = req.headers.get("x-auto-sync-secret");
    if (cookie) forwardHeaders.cookie = cookie;
    if (autoSecret) forwardHeaders["x-auto-sync-secret"] = autoSecret;

    const topPickRes = await fetch(`${origin}/api/sync-mlb-top-picks?day=${dayParam ?? "today"}`, {
      cache: "no-store",
      headers: forwardHeaders,
    });
    const topPickJson = await topPickRes.json();

    if (!topPickRes.ok || !topPickJson.ok) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: topPickJson.error ?? "MLB odds synced, but team-pick sync failed.",
        },
        { status: 500 },
        { fallbackPath: "/mlb" }
      );
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("sync-mlb-odds");
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      message: `Cached MLB odds and refreshed team picks for ${formattedDate}`,
      businessDate: formattedDate,
      topPicks: topPickJson.data ?? [],
    }, undefined, { fallbackPath: "/mlb" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
      { fallbackPath: "/mlb" }
    );
  }
}
