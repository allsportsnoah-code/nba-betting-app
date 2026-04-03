import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { settleUnits } from "@/lib/units";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  const sport = req.nextUrl.searchParams.get("sport");

  let query = supabase.from("picks").select("pick_date, sport, odds_taken, stake_units, status").neq("status", "pending");

  if (sport) query = query.eq("sport", sport);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const grouped: Record<string, { date: string; units: number; wins: number; losses: number; pushes: number }> = {};

  for (const row of data ?? []) {
    const key = `${row.sport}-${row.pick_date}`;
    if (!grouped[key]) {
      grouped[key] = { date: row.pick_date, units: 0, wins: 0, losses: 0, pushes: 0 };
    }

    const status = row.status as "win" | "loss" | "push";
    grouped[key].units += settleUnits(row.odds_taken, row.stake_units, status);
    if (status === "win") grouped[key].wins += 1;
    if (status === "loss") grouped[key].losses += 1;
    if (status === "push") grouped[key].pushes += 1;
  }

  const result = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ ok: true, data: result });
}