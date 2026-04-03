import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();

  const date = req.nextUrl.searchParams.get("date");
  const sport = req.nextUrl.searchParams.get("sport");
  const scope = req.nextUrl.searchParams.get("scope");

  let query = supabase.from("picks").select("*").order("is_top_pick", { ascending: false }).order("top_pick_rank", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });

  if (date) query = query.eq("pick_date", date);
  if (sport) query = query.eq("sport", sport);
  if (scope) query = query.eq("market_scope", scope);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  const body = await req.json();

  const { data, error } = await supabase.from("picks").insert(body).select("*");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}