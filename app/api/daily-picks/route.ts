import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { evaluateTeamGames } from "@/lib/teamModel";

function gameLabel(game: any) {
  return `${game.away_team} @ ${game.home_team}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = req.nextUrl.origin;
    const now = new Date();

    const oddsRes = await fetch(`${origin}/api/odds?day=${day}`, {
      cache: "no-store",
    });
    const odds = await oddsRes.json();

    if (!odds.ok) {
      return NextResponse.json(
        { ok: false, error: odds.error || "Failed to load odds for daily picks" },
        { status: 500 }
      );
    }

    const businessDate = odds.businessDate;
    const evaluatedGames = evaluateTeamGames(odds.data ?? []);

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "team")
      .eq("market_type", "spread")
      .eq("is_top_pick", true)
      .order("top_pick_rank", { ascending: true });

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const rows = existingRows ?? [];
    const existingByGame = new Map(rows.map((r: any) => [r.game_label, r]));

    const lockedRows: any[] = [];
    const unlockedRows: any[] = [];

    for (const row of rows) {
      const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
      const shouldLock = gameStart && gameStart <= now;

      if (shouldLock && !row.locked_at) {
        await supabase
          .from("picks")
          .update({
            locked_at: now.toISOString(),
          })
          .eq("id", row.id);

        row.locked_at = now.toISOString();
      }

      if (row.locked_at || shouldLock) lockedRows.push(row);
      else unlockedRows.push(row);
    }

    const lockedLabels = new Set(lockedRows.map((r: any) => r.game_label));

    const candidates = evaluatedGames
      .filter((g: any) => {
        if (g.signal === "Pass" || g.officialOdds === null || g.spreadEdge === null) return false;
        if (Math.abs(g.spreadEdge) < 1.5) return false;

        const start = new Date(g.game.commence_time);
        if (start <= now) return false;

        if (g.signal === "Home value" && g.spreadEdge > 0) return true;
        if (g.signal === "Away value" && g.spreadEdge < 0) return true;

        return false;
      })
      .filter((g: any) => !lockedLabels.has(gameLabel(g.game)))
      .sort((a: any, b: any) => Math.abs(b.spreadEdge) - Math.abs(a.spreadEdge));

    const slotsOpen = Math.max(0, 3 - lockedRows.length);
    const selectedCandidates = candidates.slice(0, slotsOpen);

    const selectedLabels = new Set(selectedCandidates.map((c: any) => gameLabel(c.game)));

    for (const row of unlockedRows) {
      if (!selectedLabels.has(row.game_label)) {
        await supabase
          .from("picks")
          .update({
            is_top_pick: false,
            top_pick_rank: null,
          })
          .eq("id", row.id);
      }
    }

    const finalItems: any[] = [...lockedRows];

    for (const candidate of selectedCandidates) {
      const label = gameLabel(candidate.game);
      const existing = existingByGame.get(label);

      const payload = {
        pick_date: businessDate,
        sport: "NBA",
        market_scope: "team",
        market_type: "spread",
        game_label: label,
        home_team: candidate.game.home_team,
        away_team: candidate.game.away_team,
        player_name: null,
        sportsbook: "DraftKings",
        side: candidate.officialSide,
        line_taken: candidate.officialLine,
        odds_taken: candidate.officialOdds ?? -110,
        stake_units: 1,
        confidence_score: candidate.confidenceScore,
        projected_line: candidate.projectedHomeSpread,
        projected_home_score: candidate.projectedHomeScore,
        projected_away_score: candidate.projectedAwayScore,
        market_line: candidate.marketHomeSpread,
        edge: candidate.spreadEdge,
        edge_label: candidate.signal,
        is_top_pick: true,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: null,
        game_start_time: candidate.game.commence_time,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updated) finalItems.push(updated);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) finalItems.push(inserted);
      } else if (existing?.locked_at) {
        finalItems.push(existing);
      }
    }

    const ranked = finalItems
      .sort((a: any, b: any) => {
        const aLocked = a.locked_at ? 0 : 1;
        const bLocked = b.locked_at ? 0 : 1;
        if (aLocked !== bLocked) return aLocked - bLocked;
        return 0;
      })
      .slice(0, 3);

    for (let i = 0; i < ranked.length; i++) {
      const row = ranked[i];
      await supabase
        .from("picks")
        .update({ top_pick_rank: i + 1 })
        .eq("id", row.id);
      row.top_pick_rank = i + 1;
    }

    return NextResponse.json({
      ok: true,
      businessDate,
      data: ranked,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}