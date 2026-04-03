import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type PickRow = {
  sport?: string | null;
  pick_date?: string | null;
  game_start_time?: string | null;
};

function getDisplayDate(row: PickRow) {
  if (!row.game_start_time) return row.pick_date ?? null;

  const gameStart = new Date(row.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return row.pick_date ?? null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(gameStart);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const date = req.nextUrl.searchParams.get("date");
    const sport = req.nextUrl.searchParams.get("sport");
    const scope = req.nextUrl.searchParams.get("scope");

    let query = supabase
      .from("picks")
      .select("*")
      .order("is_top_pick", { ascending: false })
      .order("top_pick_rank", { ascending: true })
      .order("created_at", { ascending: false });

    if (date) query = query.eq("pick_date", date);
    if (sport) query = query.eq("sport", sport);
    if (scope) query = query.eq("market_scope", scope);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let rows = (data ?? []) as PickRow[];

    if (date) {
      rows = rows.filter((row) => {
        if (row.sport !== "MLB") return row.pick_date === date;
        return getDisplayDate(row) === date;
      });
    } else {
      rows = rows.filter((row) => {
        if (row.sport !== "MLB") return true;
        return !row.pick_date || getDisplayDate(row) === row.pick_date;
      });
    }

    return NextResponse.json({ ok: true, data: rows });
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

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { data, error } = await supabase.from("picks").insert(body).select("*");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
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
