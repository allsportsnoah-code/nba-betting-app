import { NextRequest } from "next/server";
import { setCachedData } from "@/lib/cache";
import { buildNflContextMap } from "@/lib/nflContext";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";
import type { NflOddsGame, CachedNflOddsPayload } from "@/lib/nflOddsCache";
import { getNflOddsCacheKey, getExpectedNflWeekStart } from "@/lib/nflOddsCache";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const origin = getRequestOrigin(req);
    const oddsUrl = new URL(`${origin}/api/odds`);
    oddsUrl.searchParams.set("sport", "NFL");
    oddsUrl.searchParams.set("day", "week");

    const oddsRes = await fetch(oddsUrl.toString(), { cache: "no-store" });
    const odds = await oddsRes.json();

    if (!odds.ok) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: odds.error ?? "Odds API failed" },
        { status: 500 },
        { fallbackPath: "/nfl" }
      );
    }

    const games = (odds.data ?? []) as NflOddsGame[];
    const weekStart = getExpectedNflWeekStart();

    const context = await buildNflContextMap(
      games.map((g) => ({ id: g.id, home_team: g.home_team, away_team: g.away_team }))
    );

    const payload: CachedNflOddsPayload = {
      businessDate: odds.businessDate ?? weekStart,
      weekStart,
      data: games,
      context,
    };

    await setCachedData(getNflOddsCacheKey(), payload);

    const forwardHeaders: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const autoSecret = req.headers.get("x-auto-sync-secret");
    if (cookie) forwardHeaders.cookie = cookie;
    if (autoSecret) forwardHeaders["x-auto-sync-secret"] = autoSecret;

    const topPickRes = await fetch(`${origin}/api/sync-nfl-top-picks`, {
      cache: "no-store",
      headers: forwardHeaders,
    });
    const topPickJson = await topPickRes.json();

    if (!topPickRes.ok || !topPickJson.ok) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: topPickJson.error ?? "NFL odds cached but top-picks sync failed." },
        { status: 500 },
        { fallbackPath: "/nfl" }
      );
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("sync-nfl-odds");
    }

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        message: `NFL odds and context cached for week of ${weekStart}. ${games.length} games found.`,
        weekStart,
        gameCount: games.length,
        topPicks: topPickJson.data ?? [],
      },
      undefined,
      { fallbackPath: "/nfl" }
    );
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/nfl" }
    );
  }
}
