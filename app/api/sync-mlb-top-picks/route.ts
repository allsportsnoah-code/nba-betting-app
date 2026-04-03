import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getCachedData } from "@/lib/cache";
import { evaluateMlbGames, type MlbOddsGame } from "@/lib/mlbModel";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import {
  buildMlbCandidates,
  candidateKey,
  labelForGame,
  rankBestValueCandidates,
  rankTopHitRateCandidates,
} from "@/lib/mlbPickRanking";
import { requireSyncAccess } from "@/lib/ownerAuth";

type ExistingPickRow = {
  id: number;
  game_label: string;
  market_type: "moneyline" | "spread" | "total";
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  locked_at?: string | null;
  game_start_time?: string | null;
  top_pick_rank?: number | null;
};

type SyncedRow = {
  id: number;
  top_pick_rank?: number | null;
  locked_at?: string | null;
};

async function splitLockedRows(rows: ExistingPickRow[], now: Date, supabase: ReturnType<typeof getSupabaseServer>) {
  const lockedRows: ExistingPickRow[] = [];
  const unlockedRows: ExistingPickRow[] = [];

  for (const row of rows) {
    const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
    const shouldLock = Boolean(gameStart && gameStart <= now);

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
    const now = new Date();
    const cachedOddsRow = await getCachedData(`mlb_odds_${day}`);
    const cachedOdds =
      (cachedOddsRow?.data as { businessDate?: string; data?: MlbOddsGame[] } | null) ?? null;

    if (!cachedOdds?.businessDate) {
      return NextResponse.json(
        { ok: false, error: "No cached MLB odds found. Sync MLB odds first." },
        { status: 400 }
      );
    }

    const evaluatedGames = evaluateMlbGames(cachedOdds.data ?? [], mlbTeamRatings, mlbParkFactors);
    const businessDate = cachedOdds.businessDate;

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team");

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const rows = (existingRows ?? []) as ExistingPickRow[];
    const existingByKey = new Map(
      rows.map((row) => [`${row.game_label}::${row.market_type}`, row])
    );
    const { lockedRows, unlockedRows } = await splitLockedRows(rows, now, supabase);

    const allCandidates = buildMlbCandidates(evaluatedGames, now);
    const lockedKeys = new Set(lockedRows.map((row) => `${row.game_label}::${row.market_type}`));
    const availableCandidates = allCandidates.filter(
      (candidate) => !lockedKeys.has(candidateKey(candidate))
    );
    const topHitRateCandidates = rankTopHitRateCandidates(availableCandidates);
    const bestValueCandidates = rankBestValueCandidates(availableCandidates);
    const topCandidateKeys = new Set(topHitRateCandidates.slice(0, 3).map(candidateKey));
    const bestValueCandidateKeys = new Set(bestValueCandidates.slice(0, 3).map(candidateKey));
    const allCandidateKeys = new Set(availableCandidates.map(candidateKey));

    for (const row of unlockedRows) {
      const rowKey = `${row.game_label}::${row.market_type}`;
      if (!allCandidateKeys.has(rowKey)) {
        await supabase.from("picks").delete().eq("id", row.id);
      }
    }

    const finalItems: SyncedRow[] = lockedRows.map((row) => ({
      id: row.id,
      top_pick_rank: row.top_pick_rank,
      locked_at: row.locked_at,
    }));

    for (const candidate of availableCandidates) {
      const label = labelForGame(candidate.game);
      const rowKey = `${label}::${candidate.marketType}`;
      const existing = existingByKey.get(rowKey);
      const isTopPick = topCandidateKeys.has(rowKey);

      const payload = {
        pick_date: businessDate,
        sport: "MLB",
        market_scope: "team",
        market_type: candidate.marketType,
        game_label: label,
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
        top_pick_rank: null,
        notes: bestValueCandidateKeys.has(rowKey) ? "best_value" : null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.game.commence_time,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updated) {
          finalItems.push({
            id: updated.id,
            top_pick_rank: updated.top_pick_rank,
            locked_at: updated.locked_at,
          });
        }
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) {
          finalItems.push({
            id: inserted.id,
            top_pick_rank: inserted.top_pick_rank,
            locked_at: inserted.locked_at,
          });
        }
      } else {
        finalItems.push({
          id: existing.id,
          top_pick_rank: existing.top_pick_rank,
          locked_at: existing.locked_at,
        });
      }
    }

    const rankedTopPicks = topHitRateCandidates.slice(0, 3);

    for (let index = 0; index < rankedTopPicks.length; index++) {
      const candidate = rankedTopPicks[index];
      const label = labelForGame(candidate.game);

      await supabase
        .from("picks")
        .update({ top_pick_rank: index + 1, is_top_pick: true })
        .eq("pick_date", businessDate)
        .eq("sport", "MLB")
        .eq("market_scope", "team")
        .eq("game_label", label)
        .eq("market_type", candidate.marketType);
    }

    await supabase
      .from("picks")
      .update({ top_pick_rank: null })
      .eq("pick_date", businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team")
      .eq("is_top_pick", false);

    const { data: rankedRows, error: rankedError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team")
      .eq("is_top_pick", true)
      .order("top_pick_rank", { ascending: true });

    if (rankedError) {
      return NextResponse.json({ ok: false, error: rankedError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      businessDate,
      data: rankedRows ?? [],
      totalSaved: availableCandidates.length + lockedRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
