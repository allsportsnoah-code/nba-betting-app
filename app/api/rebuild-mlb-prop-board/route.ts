import { NextRequest, NextResponse } from "next/server";
import { captureMlbHistorySnapshot } from "@/lib/mlbHistorySnapshot";
import { getMlbDoubleheaderGameLabels } from "@/lib/mlbDoubleheader";
import { getCachedMlbOddsPayloadForBusinessDate } from "@/lib/mlbOddsCache";
import { capturePublicFreePickHistory } from "@/lib/publicFreePickHistory";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { buildMlbLearningProfile } from "@/lib/mlbLearning";
import { requireSyncAccess } from "@/lib/ownerAuth";
import {
  propBoardKey,
  selectMlbPropBoardCandidates,
  toSavedPropBoardCandidate,
  type SavedMlbPropBoardRow,
} from "@/lib/mlbPropBoard";

type ExistingPropRow = SavedMlbPropBoardRow & {
  id: number;
  locked_at?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
};

async function splitLockedRows(
  rows: ExistingPropRow[],
  now: Date,
  supabase: ReturnType<typeof getSupabaseServer>
) {
  const lockedRows: ExistingPropRow[] = [];
  const unlockedRows: ExistingPropRow[] = [];

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

function assignOpenTopRanks(
  lockedRows: ExistingPropRow[],
  candidateKeys: string[]
) {
  const occupiedRanks = new Set(
    lockedRows
      .map((row) => row.top_pick_rank)
      .filter((rank): rank is number => typeof rank === "number" && rank >= 1 && rank <= 3)
  );
  const rankByKey = new Map<string, number>();
  let nextRank = 1;

  for (const key of candidateKeys) {
    while (occupiedRanks.has(nextRank) && nextRank <= 3) {
      nextRank += 1;
    }

    if (nextRank > 3) break;
    rankByKey.set(key, nextRank);
    occupiedRanks.add(nextRank);
    nextRank += 1;
  }

  return rankByKey;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const pickDate = req.nextUrl.searchParams.get("pickDate");
    if (!pickDate) {
      return NextResponse.json({ ok: false, error: "Missing pickDate" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const learningProfile = await buildMlbLearningProfile();
    const { data, error } = await supabase
      .from("picks")
      .select("id, external_event_id, game_label, player_name, market_type, side, line_taken, odds_taken, confidence_score, edge, edge_label, projected_line, market_line, game_start_time, locked_at, is_top_pick, top_pick_rank, notes")
      .eq("pick_date", pickDate)
      .eq("sport", "MLB")
      .eq("market_scope", "player_prop");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as ExistingPropRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No saved MLB player props found for ${pickDate}.` },
        { status: 404 }
      );
    }

    const now = new Date();
    const { lockedRows, unlockedRows } = await splitLockedRows(rows, now, supabase);
    const lockedTopRows = lockedRows
      .filter((row) => row.is_top_pick)
      .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
    const lockedBestValueRows = lockedRows.filter((row) => row.notes === "best_value");
    const candidates = unlockedRows.map(toSavedPropBoardCandidate);
    const cachedOdds = await getCachedMlbOddsPayloadForBusinessDate(pickDate);
    const excludedDoubleheaderGameLabels = getMlbDoubleheaderGameLabels(
      (cachedOdds?.data ?? []).map((game) => ({
        external_event_id: game.id,
        game_label: `${game.away_team} @ ${game.home_team}`,
        game_start_time: game.commence_time,
      }))
    );
    const { topCandidates, bestValueCandidates, strictCandidates, relaxedCandidates, usedRelaxedFallback } =
      selectMlbPropBoardCandidates(candidates, learningProfile, 2, excludedDoubleheaderGameLabels);
    const selectedTopCandidates = topCandidates.slice(0, Math.max(0, 3 - lockedTopRows.length));
    const selectedBestValueCandidates = bestValueCandidates.slice(
      0,
      Math.max(0, 3 - lockedBestValueRows.length)
    );
    const topKeys = new Set(selectedTopCandidates.map((candidate) => propBoardKey(candidate)));
    const valueKeys = new Set(selectedBestValueCandidates.map((candidate) => propBoardKey(candidate)));
    const topRanksByKey = assignOpenTopRanks(
      lockedTopRows,
      selectedTopCandidates.map((candidate) => propBoardKey(candidate))
    );

    for (const row of unlockedRows) {
      const key = propBoardKey(row);
      await supabase
        .from("picks")
        .update({
          is_top_pick: topKeys.has(key),
          top_pick_rank: topKeys.has(key) ? topRanksByKey.get(key) ?? null : null,
          notes: valueKeys.has(key) ? "best_value" : null,
        })
        .eq("id", row.id);
    }

    await captureMlbHistorySnapshot(pickDate);
    await capturePublicFreePickHistory(pickDate, { force: true });

    return NextResponse.json({
      ok: true,
      pickDate,
      totalRows: rows.length,
      strictEligibleCount: strictCandidates.length,
      relaxedEligibleCount: relaxedCandidates.length,
      topPickCount: topCandidates.length,
      bestValueCount: bestValueCandidates.length,
      usedRelaxedFallback,
      excludedDoubleheaderGameLabels: Array.from(excludedDoubleheaderGameLabels),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
