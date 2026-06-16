import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { MlbContextMap } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import { evaluateMlbGames, type EvaluatedMlbGame, type MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import { buildMlbCandidates, labelForGame, type MlbTeamMarketType } from "@/lib/mlbPickRanking";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";

type ExistingPickRow = {
  id: number;
  game_label: string;
  market_type: MlbTeamMarketType;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  locked_at?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const eventId = req.nextUrl.searchParams.get("eventId");
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";

    if (!eventId) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "Missing eventId" }, { status: 400 }, { fallbackPath: "/mlb" });
    }

    const resolvedOdds = await getResolvedMlbOddsCache(day);
    const cachedOdds = (resolvedOdds.active as {
      businessDate?: string;
      data?: MlbOddsGame[];
      context?: MlbContextMap;
      learning?: MlbLearningProfile;
    } | null) ?? null;

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

    const evaluatedGames = evaluateMlbGames(
      cachedOdds.data ?? [],
      mlbTeamRatings,
      mlbParkFactors,
      cachedOdds.context,
      cachedOdds.learning
    );

    const game = evaluatedGames.find((item) => item.game.id === eventId);
    if (!game) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "Game not found in cached MLB slate." }, { status: 404 }, { fallbackPath: "/mlb" });
    }

    const now = new Date();
    if (new Date(game.game.commence_time) <= now) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "This game has already started and can no longer be synced." }, { status: 400 }, { fallbackPath: "/mlb" });
    }

    const supabase = getSupabaseServer();
    const candidates = buildMlbCandidates([game as EvaluatedMlbGame], now);
    const gameLabel = `${game.game.away_team} @ ${game.game.home_team}`;

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", cachedOdds.businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team")
      .eq("game_label", gameLabel);

    if (existingError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: existingError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const existingByMarket = new Map(
      ((existingRows ?? []) as ExistingPickRow[]).map((row) => [row.market_type, row])
    );

    const synced: Array<{ id: number; side: string; market_type: string }> = [];

    for (const candidate of candidates) {
      const existing = existingByMarket.get(candidate.marketType);
      if (existing?.locked_at) continue;

      const payload = {
        pick_date: cachedOdds.businessDate,
        sport: "MLB",
        market_scope: "team",
        market_type: candidate.marketType,
        game_label: labelForGame(candidate.game),
        home_team: candidate.game.home_team,
        away_team: candidate.game.away_team,
        player_name: null,
        sportsbook: "DraftKings",
        side: candidate.side,
        line_taken: candidate.lineTaken,
        odds_taken: candidate.oddsTaken,
        stake_units: 1,
        confidence_score: candidate.confidenceScore,
        projected_line: candidate.projectedLine,
        projected_home_score: candidate.projectedHomeScore,
        projected_away_score: candidate.projectedAwayScore,
        market_line: candidate.marketLine,
        edge: candidate.edge,
        edge_label: candidate.edgeLabel,
        is_top_pick: existing ? undefined : false,
        top_pick_rank: existing?.locked_at ? undefined : null,
        notes: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.game.commence_time,
        external_event_id: candidate.game.id,
      };

      if (existing) {
        const { data: updated, error: updateError } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select("id, side, market_type")
          .single();

        if (!updateError && updated) synced.push(updated);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("picks")
          .insert(payload)
          .select("id, side, market_type")
          .single();

        if (!insertError && inserted) synced.push(inserted);
      }
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate: cachedOdds.businessDate,
      game: gameLabel,
      message: `Synced MLB team picks for ${gameLabel}`,
      syncedCount: synced.length,
      data: synced,
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
