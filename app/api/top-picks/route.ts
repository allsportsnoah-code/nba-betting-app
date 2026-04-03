import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getCachedData } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";

    const cached = await getCachedData(`team_odds_${day}`);
    const businessDate = cached?.data?.businessDate;

    if (!businessDate) {
      return NextResponse.json({
        ok: true,
        businessDate: null,
        data: [],
      });
    }

    const { data, error } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "team")
      .eq("market_type", "spread")
      .eq("is_top_pick", true)
      .order("top_pick_rank", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      businessDate,
      data: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}