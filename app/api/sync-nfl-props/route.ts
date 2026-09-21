import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getResolvedNflOddsCache, getExpectedNflWeekStart } from "@/lib/nflOddsCache";
import { evaluateNflPropMarkets } from "@/lib/nflPropsModel";
import type { NflOddsGame } from "@/lib/nflOddsCache";
import { fetchPrizePicksProps } from "@/lib/prizepicksNfl";
import { extractPropGameContext } from "@/lib/nflPropEvaluator";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();
    const now = new Date();
    const resolvedOdds = await getResolvedNflOddsCache(now);
    const weekStart = getExpectedNflWeekStart(now);

    if (!resolvedOdds.active?.data?.length) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: "No cached NFL games. Sync team odds first via sync-nfl-odds." },
        { status: 400 },
        { fallbackPath: "/nfl" }
      );
    }

    const games = resolvedOdds.active.data as NflOddsGame[];
    const upcomingGames = games.filter((g) => new Date(g.commence_time) > now);

    // Fetch all props from PrizePicks (free, no API key needed)
    const { byGameId, totalProjections, error: ppError } = await fetchPrizePicksProps(upcomingGames);

    if (ppError && byGameId.size === 0) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: `PrizePicks fetch failed: ${ppError}` },
        { status: 502 },
        { fallbackPath: "/nfl" }
      );
    }

    const debugGames: { game: string; candidates: number; saved: number; noData: boolean }[] = [];
    let totalSaved = 0;

    for (const game of upcomingGames) {
      const gameLabel = `${game.away_team} @ ${game.home_team}`;
      const gameDate = game.commence_time.slice(0, 10);

      const markets = byGameId.get(game.id) ?? [];

      if (markets.length === 0) {
        debugGames.push({ game: gameLabel, candidates: 0, saved: 0, noData: true });
        continue;
      }

      const gameCtx = extractPropGameContext(game);
      const candidates = evaluateNflPropMarkets(game.id, gameLabel, game.home_team, game.away_team, markets, gameCtx);

      // Delete existing unlocked prop picks for this game
      await supabase
        .from("picks")
        .delete()
        .eq("sport", "NFL")
        .eq("market_scope", "props")
        .eq("game_label", gameLabel)
        .gte("pick_date", weekStart)
        .is("locked_at", null);

      // Save top 16 per game ranked by lottoScore
      const toSave = candidates.slice(0, 16);
      let gameSaved = 0;

      for (const c of toSave) {
        const { error } = await supabase.from("picks").insert({
          pick_date: gameDate,
          sport: "NFL",
          market_scope: "props",
          market_type: c.marketKey,
          game_label: gameLabel,
          home_team: game.home_team,
          away_team: game.away_team,
          player_name: c.playerName,
          sportsbook: "PrizePicks",
          side: c.side,
          line_taken: c.lineTaken,
          odds_taken: c.oddsTaken,
          stake_units: 1,
          confidence_score: c.confidenceScore,
          projected_line: c.lineTaken,
          market_line: c.lineTaken,
          edge: c.contextBoost,
          edge_label: c.teamContext === "favorable" ? "favorable team matchup" : null,
          is_top_pick: toSave.indexOf(c) < 9,
          top_pick_rank: null,
          notes: `lotto_score:${c.lottoScore}|hit:${c.hitProbability}|proj:${c.projectedValue}|edge:${c.edge}`,
          status: "pending",
          game_start_time: game.commence_time,
          external_event_id: game.id,
        });
        if (!error) { gameSaved++; totalSaved++; }
      }

      debugGames.push({ game: gameLabel, candidates: candidates.length, saved: gameSaved, noData: false });
    }

    const noPropsGames = debugGames.filter((g) => g.noData).length;
    const withPropsGames = debugGames.filter((g) => !g.noData).length;

    const message = totalSaved > 0
      ? `Saved ${totalSaved} prop picks across ${withPropsGames} games via PrizePicks (${totalProjections} total projections fetched).${noPropsGames > 0 ? ` ${noPropsGames} game(s) had no props.` : ""}`
      : `No props saved. PrizePicks returned ${totalProjections} projections but none matched upcoming games.${ppError ? ` Warning: ${ppError}` : ""}`;

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: totalSaved > 0,
        weekStart,
        message,
        totalSaved,
        totalProjections,
        upcomingGames: upcomingGames.length,
        gamesWithProps: withPropsGames,
        gamesNoProps: noPropsGames,
        debug: debugGames,
        ppError: ppError ?? null,
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
