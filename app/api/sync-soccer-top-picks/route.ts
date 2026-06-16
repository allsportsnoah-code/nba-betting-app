import { NextRequest } from "next/server";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getResolvedSoccerOddsCache, normalizeSoccerCompetition } from "@/lib/soccerOddsCache";
import {
  evaluateSoccerGames,
  getSoccerDisplayCompetition,
  selectSoccerBoardCandidates,
  soccerCandidateKey,
  type SoccerCandidate,
  type SoccerOddsGame,
} from "@/lib/soccerModel";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ExistingSoccerPickRow = {
  id: number;
  pick_date: string;
  sport?: string | null;
  market_scope?: string | null;
  external_event_id?: string | null;
  game_label?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  side?: string | null;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  locked_at?: string | null;
  game_start_time?: string | null;
  top_pick_rank?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

function labelForGame(game: SoccerOddsGame) {
  return `${game.away_team} @ ${game.home_team}`;
}

function formatLineKey(line: number | null | undefined) {
  return line === null || line === undefined ? "" : `${line}`;
}

function rowKey(row: ExistingSoccerPickRow) {
  return [
    row.external_event_id ?? row.game_label ?? "",
    row.market_type ?? "",
    row.side ?? "",
    formatLineKey(row.line_taken),
  ].join("::");
}

function candidateRowKey(candidate: SoccerCandidate) {
  return [
    candidate.game.id,
    candidate.marketType,
    candidate.side,
    formatLineKey(candidate.lineTaken),
  ].join("::");
}

async function splitLockedRows(rows: ExistingSoccerPickRow[], now: Date, supabase: ReturnType<typeof getSupabaseServer>) {
  const lockedRows: ExistingSoccerPickRow[] = [];
  const unlockedRows: ExistingSoccerPickRow[] = [];

  for (const row of rows) {
    const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
    const shouldLock = Boolean(gameStart && !Number.isNaN(gameStart.getTime()) && gameStart <= now);

    if (shouldLock && !row.locked_at) {
      await supabase.from("picks").update({ locked_at: now.toISOString() }).eq("id", row.id);
      row.locked_at = now.toISOString();
    }

    if (row.locked_at || shouldLock) lockedRows.push(row);
    else unlockedRows.push(row);
  }

  return { lockedRows, unlockedRows };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const competition = normalizeSoccerCompetition(req.nextUrl.searchParams.get("competition"));
    const now = new Date();
    const resolvedOdds = await getResolvedSoccerOddsCache(competition, day, now);
    const cachedOdds = resolvedOdds.active;

    if (!cachedOdds?.businessDate) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: `No cached ${getSoccerDisplayCompetition(competition)} odds found for betting day ${resolvedOdds.expectedBusinessDate}. Sync soccer odds first.`,
        },
        { status: 400 },
        { fallbackPath: "/soccer" }
      );
    }

    const games = (cachedOdds.data ?? []) as SoccerOddsGame[];
    const evaluatedGames = evaluateSoccerGames(games, competition);
    const allCandidates = evaluatedGames.flatMap((game) => game.candidates);
    const { topCandidates, bestValueCandidates } = selectSoccerBoardCandidates(allCandidates);
    const topRanks = new Map(topCandidates.map((candidate, index) => [soccerCandidateKey(candidate), index + 1]));
    const bestValueKeys = new Set(bestValueCandidates.map(soccerCandidateKey));
    const selectedCandidates = [...topCandidates, ...bestValueCandidates].filter(
      (candidate, index, candidates) =>
        candidates.findIndex((entry) => soccerCandidateKey(entry) === soccerCandidateKey(candidate)) === index
    );
    const selectedKeys = new Set(selectedCandidates.map(candidateRowKey));
    const currentEventIds = new Set(games.map((game) => game.id));

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", cachedOdds.businessDate)
      .eq("sport", "SOCCER")
      .eq("market_scope", "team");

    if (existingError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: existingError.message }, { status: 500 }, { fallbackPath: "/soccer" });
    }

    const relevantRows = ((existingRows ?? []) as ExistingSoccerPickRow[]).filter((row) =>
      row.external_event_id ? currentEventIds.has(row.external_event_id) : row.edge_label?.includes(getSoccerDisplayCompetition(competition))
    );
    const existingByKey = new Map(relevantRows.map((row) => [rowKey(row), row]));
    const { lockedRows, unlockedRows } = await splitLockedRows(relevantRows, now, supabase);

    for (const row of unlockedRows) {
      if (!selectedKeys.has(rowKey(row))) {
        await supabase.from("picks").delete().eq("id", row.id);
      }
    }

    for (const candidate of selectedCandidates) {
      const key = candidateRowKey(candidate);
      const existing = existingByKey.get(key);
      const topRank = topRanks.get(soccerCandidateKey(candidate)) ?? null;
      const isBestValue = bestValueKeys.has(soccerCandidateKey(candidate));
      const isTopPick = topRank !== null;
      const lockedExisting = lockedRows.find((row) => row.id === existing?.id);

      if (lockedExisting) continue;

      const payload = {
        pick_date: cachedOdds.businessDate,
        sport: "SOCCER",
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
        is_top_pick: isTopPick,
        top_pick_rank: topRank,
        notes: isBestValue ? "best_value" : null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.game.commence_time,
        external_event_id: candidate.game.id,
      };

      if (existing) {
        const { error: updateError } = await supabase.from("picks").update(payload).eq("id", existing.id);
        if (updateError) {
          return apiJsonOrNativeRedirect(
            req,
            { ok: false, error: updateError.message },
            { status: 500 },
            { fallbackPath: "/soccer" }
          );
        }
      } else {
        const { error: insertError } = await supabase.from("picks").insert(payload);
        if (insertError) {
          return apiJsonOrNativeRedirect(
            req,
            { ok: false, error: insertError.message },
            { status: 500 },
            { fallbackPath: "/soccer" }
          );
        }
      }
    }

    let rankedRows: ExistingSoccerPickRow[] = [];

    if (currentEventIds.size > 0) {
      const { data, error: rankedError } = await supabase
        .from("picks")
        .select("*")
        .eq("pick_date", cachedOdds.businessDate)
        .eq("sport", "SOCCER")
        .eq("market_scope", "team")
        .in("external_event_id", Array.from(currentEventIds))
        .order("is_top_pick", { ascending: false })
        .order("top_pick_rank", { ascending: true })
        .order("edge", { ascending: false });

      if (rankedError) {
        return apiJsonOrNativeRedirect(req, { ok: false, error: rankedError.message }, { status: 500 }, { fallbackPath: "/soccer" });
      }

      rankedRows = (data ?? []) as ExistingSoccerPickRow[];
    }

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        businessDate: cachedOdds.businessDate,
        competition,
        message: `Rebuilt ${getSoccerDisplayCompetition(competition)} soccer picks for ${cachedOdds.businessDate}`,
        data: rankedRows,
        totalCandidates: allCandidates.length,
        totalSaved: selectedCandidates.length + lockedRows.length,
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
