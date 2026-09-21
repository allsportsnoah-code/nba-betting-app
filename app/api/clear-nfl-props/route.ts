import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getExpectedNflWeekStart } from "@/lib/nflOddsCache";

export async function GET(req: NextRequest) {
  const access = await requireSyncAccess(req);
  if (!access.ok) return access.response;

  const supabase = getSupabaseServer();
  const weekStart = getExpectedNflWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const { error, count } = await supabase
    .from("picks")
    .delete({ count: "exact" })
    .eq("sport", "NFL")
    .eq("market_scope", "props")
    .gte("pick_date", weekStart)
    .lte("pick_date", weekEndStr)
    .is("locked_at", null);

  if (error) {
    return apiJsonOrNativeRedirect(req, { ok: false, error: error.message }, { status: 500 }, { fallbackPath: "/nfl" });
  }

  return apiJsonOrNativeRedirect(req, { ok: true, deleted: count, weekStart, weekEnd: weekEndStr }, undefined, { fallbackPath: "/nfl" });
}
