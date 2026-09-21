import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getResolvedNflOddsCache } from "@/lib/nflOddsCache";
import { evaluateNflGames, selectNflTopPicks, selectNflBestValue } from "@/lib/nflModel";
import { getNflTopPickScore } from "@/lib/nflMarkets";
import type { NflCandidate } from "@/lib/nflMarkets";
import type { NflGameContext } from "@/lib/nflContext";
import type { NflOddsGame } from "@/lib/nflOddsCache";

type ExistingNflPickRow = {
  id: number;
  game_label: string;
  market_type: string;
  side: string;
  status?: string | null;
  final_score?: string | null;
  locked_at?: string | null;
  game_start_time?: string | null;
};

function gameLabel(game: NflOddsGame) {
  return `${game.away_team} @ ${game.home_team}`;
}

function candidateKey(label: string, candidate: NflCandidate) {
  return `${label}::${candidate.marketType}::${candidate.side}`;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();
    const now = new Date();
    const resolvedOdds = await getResolvedNflOddsCache(now);

    if (!resolvedOdds.active?.weekStart) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: "No cached NFL odds found. Run sync-nfl-odds first." },
        { status: 400 },
        { fallbackPath: "/nfl" }
      );
    }

    const cachedOdds = resolvedOdds.active;
    const games = (cachedOdds.data ?? []) as NflOddsGame[];
    const context = (cachedOdds.context ?? {}) as Record<string, NflGameContext>;
    const weekStart = cachedOdds.weekStart!;

    const evaluatedGames = evaluateNflGames(games, context);

    // Fetch existing picks for this week
    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("id, game_label, market_type, side, status, final_score, locked_at, game_start_time")
      .eq("sport", "NFL")
      .eq("market_scope", "team")
      .gte("pick_date", weekStart)
      .lte("pick_date", weekStart.slice(0, 4) + "-12-31");

    if (existingError) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: existingError.message },
        { status: 500 },
        { fallbackPath: "/nfl" }
      );
    }

    const rows = (existingRows ?? []) as ExistingNflPickRow[];
    const existingByKey = new Map(
      rows.map((row) => [`${row.game_label}::${row.market_type}::${row.side}`, row])
    );

    // Lock rows for games that have started
    for (const row of rows) {
      if (row.locked_at) continue;
      const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
      if (gameStart && gameStart <= now) {
        await supabase.from("picks").update({ locked_at: now.toISOString() }).eq("id", row.id);
        row.locked_at = now.toISOString();
      }
    }

    const lockedKeys = new Set(rows.filter((r) => r.locked_at).map((r) => `${r.game_label}::${r.market_type}::${r.side}`));
    const allCandidates: { label: string; game: NflOddsGame; candidate: NflCandidate; gameDate: string }[] = [];

    for (const evaluated of evaluatedGames) {
      if (evaluated.missingModel) continue;
      const label = gameLabel(evaluated.game);
      const gameDate = evaluated.game.commence_time.slice(0, 10);

      for (const candidate of evaluated.candidates) {
        const key = candidateKey(label, candidate);
        if (lockedKeys.has(key)) continue;
        allCandidates.push({ label, game: evaluated.game, candidate, gameDate });
      }
    }

    // Select top picks and best value
    const flatCandidates = allCandidates.map((a) => a.candidate);
    const topPicks = selectNflTopPicks(flatCandidates, 20);
    const topPickSides = new Set(topPicks.map((c) => c.side));
    const bestValue = selectNflBestValue(flatCandidates, topPickSides, 10);
    const topPickKeys = new Set(topPicks.map((c) => `${c.marketType}::${c.side}`));
    const bestValueKeys = new Set(bestValue.map((c) => `${c.marketType}::${c.side}`));

    const savedIds: number[] = [];

    for (const { label, game, candidate, gameDate } of allCandidates) {
      const key = candidateKey(label, candidate);
      const existing = existingByKey.get(key);
      const candidateTypeKey = `${candidate.marketType}::${candidate.side}`;
      const isTopPick = topPickKeys.has(candidateTypeKey);
      const isBestValue = bestValueKeys.has(candidateTypeKey);
      const topPickRank = isTopPick
        ? topPicks.findIndex((c) => `${c.marketType}::${c.side}` === candidateTypeKey) + 1
        : null;

      const pickScore = getNflTopPickScore({
        marketType: candidate.marketType,
        edge: candidate.edge,
        confidenceScore: candidate.confidenceScore,
        oddsTaken: candidate.oddsTaken,
        projectedSideMargin: candidate.projectedSideMargin,
        coverBuffer: candidate.coverBuffer,
        contextRiskScore: candidate.contextRiskScore,
      });

      const payload = {
        pick_date: gameDate,
        sport: "NFL",
        market_scope: "team",
        market_type: candidate.marketType === "game_total" ? "total" : candidate.marketType,
        game_label: label,
        home_team: game.home_team,
        away_team: game.away_team,
        player_name: null,
        sportsbook: "DraftKings",
        side: candidate.side,
        line_taken: candidate.lineTaken,
        odds_taken: candidate.oddsTaken,
        stake_units: 1,
        confidence_score: candidate.confidenceScore,
        projected_line: candidate.projectedLine,
        market_line: candidate.marketLine,
        edge: candidate.edge,
        edge_label: candidate.edgeLabel || candidate.riskFlags.join(" | ") || null,
        is_top_pick: isTopPick,
        top_pick_rank: topPickRank,
        notes: isBestValue ? "best_value" : null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        game_start_time: game.commence_time,
        external_event_id: game.id,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updated) savedIds.push(updated.id);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select("id")
          .single();
        if (inserted) savedIds.push(inserted.id);
      } else {
        savedIds.push(existing.id);
      }
    }

    // Delete stale unlocked picks that are no longer candidates
    const currentKeys = new Set(allCandidates.map((a) => candidateKey(a.label, a.candidate)));
    for (const row of rows) {
      if (row.locked_at) continue;
      const rk = `${row.game_label}::${row.market_type}::${row.side}`;
      if (!currentKeys.has(rk)) {
        await supabase.from("picks").delete().eq("id", row.id);
      }
    }

    const { data: topPickRows } = await supabase
      .from("picks")
      .select("id, game_label, side, market_type, odds_taken, confidence_score, edge, top_pick_rank")
      .eq("sport", "NFL")
      .eq("is_top_pick", true)
      .gte("pick_date", weekStart)
      .order("top_pick_rank", { ascending: true });

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        weekStart,
        message: `NFL picks synced for week of ${weekStart}. ${savedIds.length} candidates saved.`,
        data: topPickRows ?? [],
        totalSaved: savedIds.length,
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
