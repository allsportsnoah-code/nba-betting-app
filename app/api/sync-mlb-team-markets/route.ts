import { NextRequest, NextResponse } from "next/server";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import type { MlbContextMap } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import { evaluateMlbGames, type MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import { buildMlbCandidates, labelForGame, type MlbTeamMarketType } from "@/lib/mlbPickRanking";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import { MLB_SHADOW_TEAM_MARKETS, MLB_SHADOW_TEAM_MARKET_TYPES } from "@/lib/mlbTeamMarketExpansion";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ExistingPickRow = {
  id: number;
  market_type: MlbTeamMarketType;
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

function parseTargetMarketTypes(param: string | null) {
  const allowed = new Set<string>(MLB_SHADOW_TEAM_MARKET_TYPES);
  if (!param) return [...MLB_SHADOW_TEAM_MARKET_TYPES];

  return param
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is MlbTeamMarketType => allowed.has(value));
}

function getOddsMarketKeysForTargetTypes(targetMarketTypes: MlbTeamMarketType[]) {
  const keys = new Set<string>();
  if (targetMarketTypes.includes("team_total")) keys.add("team_totals");
  if (targetMarketTypes.includes("f5_moneyline")) keys.add("h2h_1st_5_innings");
  if (targetMarketTypes.includes("f5_spread")) keys.add("spreads_1st_5_innings");
  if (targetMarketTypes.includes("f5_total")) keys.add("totals_1st_5_innings");
  return Array.from(keys);
}

function getFriendlyError(error: string | null | undefined, details: string | null | undefined) {
  if ((details ?? "").includes("OUT_OF_USAGE_CREDITS")) {
    return "Team market API usage credits are exhausted right now.";
  }

  if ((details ?? "").includes("INVALID_MARKET")) {
    return "One of the requested MLB team markets is not available from the event odds endpoint.";
  }

  return error ?? "Failed to load MLB team markets.";
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const eventId = req.nextUrl.searchParams.get("eventId");
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const targetMarketTypes = parseTargetMarketTypes(req.nextUrl.searchParams.get("marketTypes"));
    const oddsMarketKeys = getOddsMarketKeysForTargetTypes(targetMarketTypes);

    if (!eventId) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "Missing eventId" }, { status: 400 }, { fallbackPath: "/mlb" });
    }

    if (targetMarketTypes.length === 0 || oddsMarketKeys.length === 0) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "No valid team markets requested." }, { status: 400 }, { fallbackPath: "/mlb" });
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

    const cachedGame = (cachedOdds.data ?? []).find((game) => game.id === eventId);
    if (!cachedGame) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: "Game not found in cached MLB odds." }, { status: 404 }, { fallbackPath: "/mlb" });
    }

    const apiKey = process.env.ODDS_API_KEY;
    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&markets=${oddsMarketKeys.join(",")}` +
      `&oddsFormat=american` +
      `&bookmakers=draftkings`;

    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();

    if (!response.ok) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: getFriendlyError(`MLB team markets API failed: ${response.status}`, text),
          details: text,
          businessDate: cachedOdds.businessDate,
          eventId,
          gameLabel: `${cachedGame.away_team} @ ${cachedGame.home_team}`,
        },
        { status: 500 },
        { fallbackPath: "/mlb" }
      );
    }

    const eventOdds = JSON.parse(text) as MlbOddsGame;
    const evaluated = evaluateMlbGames(
      [
        {
          ...cachedGame,
          bookmakers: eventOdds.bookmakers,
        },
      ],
      mlbTeamRatings,
      mlbParkFactors,
      cachedOdds.context,
      cachedOdds.learning
    );
    const now = new Date();
    const candidates = buildMlbCandidates(evaluated, now, cachedOdds.learning).filter((candidate) =>
      targetMarketTypes.includes(candidate.marketType)
    );

    const supabase = getSupabaseServer();
    const gameLabel = `${cachedGame.away_team} @ ${cachedGame.home_team}`;
    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", cachedOdds.businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team")
      .eq("external_event_id", eventId);

    if (existingError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: existingError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const existingByMarket = new Map(
      ((existingRows ?? []) as ExistingPickRow[]).map((row) => [row.market_type, row])
    );
    const candidateMarketTypes = new Set(candidates.map((candidate) => candidate.marketType));

    for (const row of (existingRows ?? []) as ExistingPickRow[]) {
      if (row.locked_at) continue;
      if (targetMarketTypes.includes(row.market_type) && !candidateMarketTypes.has(row.market_type)) {
        await supabase.from("picks").delete().eq("id", row.id);
      }
    }

    const saved: Array<{ id: number; side: string; market_type: string }> = [];

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
        is_top_pick: false,
        top_pick_rank: null,
        notes: existing?.notes === "best_value" ? null : existing?.notes ?? null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.game.commence_time,
        external_event_id: candidate.game.id,
      };

      if (existing) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select("id, side, market_type")
          .single();
        if (updated) saved.push(updated);
      } else {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select("id, side, market_type")
          .single();
        if (inserted) saved.push(inserted);
      }
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate: cachedOdds.businessDate,
      eventId,
      gameLabel,
      marketTypes: targetMarketTypes,
      syncedCount: saved.length,
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
