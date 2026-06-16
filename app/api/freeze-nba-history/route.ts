import { NextRequest, NextResponse } from "next/server";
import { captureNbaHistorySnapshot } from "@/lib/nbaHistorySnapshot";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getSupabaseServer } from "@/lib/supabaseServer";

const PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const pickDate = req.nextUrl.searchParams.get("pickDate");

    if (pickDate) {
      const snapshot = await captureNbaHistorySnapshot(pickDate);
      return NextResponse.json({
        ok: true,
        pickDate,
        teamTopPickCount: snapshot.teamTopPickIds.length,
        teamBestValueCount: snapshot.teamBestValueIds.length,
        propTopPickCount: snapshot.propTopPickIds.length,
        propBestValueCount: snapshot.propBestValueIds.length,
      });
    }

    const supabase = getSupabaseServer();
    const rows: Array<{ pick_date?: string | null }> = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("picks")
        .select("pick_date")
        .eq("sport", "NBA")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const page = (data ?? []) as Array<{ pick_date?: string | null }>;
      rows.push(...page);

      if (page.length < PAGE_SIZE) break;
    }

    const pickDates = Array.from(
      new Set(
        rows
          .map((row) => row.pick_date)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    for (const date of pickDates) {
      await captureNbaHistorySnapshot(date);
    }

    return NextResponse.json({
      ok: true,
      frozenDates: pickDates.length,
      dates: pickDates,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
