import { NextRequest, NextResponse } from "next/server";
import { captureMlbHistorySnapshot } from "@/lib/mlbHistorySnapshot";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { buildMlbLearningProfile } from "@/lib/mlbLearning";
import { requireSyncAccess } from "@/lib/ownerAuth";
import {
  candidateKey,
  savedMlbTeamBoardKey,
  selectMlbTeamBoardCandidates,
  toSavedMlbTeamCandidate,
  type SavedMlbTeamBoardRow,
} from "@/lib/mlbPickRanking";

type ExistingTeamRow = SavedMlbTeamBoardRow & {
  id: number;
};

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
      .select("*")
      .eq("pick_date", pickDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as ExistingTeamRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No saved MLB team picks found for ${pickDate}.` },
        { status: 404 }
      );
    }

    const candidates = rows
      .map((row) => toSavedMlbTeamCandidate(row, learningProfile))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    const { topCandidates, bestValueCandidates, topCandidatePool, bestValuePool } =
      selectMlbTeamBoardCandidates(candidates, learningProfile);
    const topRanks = new Map(topCandidates.map((candidate, index) => [candidateKey(candidate), index + 1]));
    const bestValueKeys = new Set(bestValueCandidates.map(candidateKey));

    for (const row of rows) {
      const key = savedMlbTeamBoardKey(row);
      await supabase
        .from("picks")
        .update({
          is_top_pick: topRanks.has(key),
          top_pick_rank: topRanks.get(key) ?? null,
          notes: bestValueKeys.has(key) ? "best_value" : null,
        })
        .eq("id", row.id);
    }

    await captureMlbHistorySnapshot(pickDate);

    return NextResponse.json({
      ok: true,
      pickDate,
      totalRows: rows.length,
      candidateCount: candidates.length,
      topCandidatePoolCount: topCandidatePool.length,
      bestValuePoolCount: bestValuePool.length,
      topPickCount: topCandidates.length,
      bestValueCount: bestValueCandidates.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
