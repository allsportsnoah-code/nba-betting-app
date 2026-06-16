import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type PickRow = {
  id?: number | null;
  created_at?: string | null;
  graded_at?: string | null;
  sport?: string | null;
  pick_date?: string | null;
  game_start_time?: string | null;
  status?: string | null;
  market_scope?: string | null;
  market_type?: string | null;
  game_label?: string | null;
  player_name?: string | null;
  side?: string | null;
  line_taken?: number | null;
};

const PAGE_SIZE = 1000;

function getNextDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(
    parsed.getUTCDate()
  ).padStart(2, "0")}`;
}

function getDisplayDate(row: PickRow) {
  if (!row.game_start_time) return row.pick_date ?? null;

  const gameStart = new Date(row.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return row.pick_date ?? null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(gameStart);

  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(
    anchor.getUTCDate()
  ).padStart(2, "0")}`;
}

function normalizePickDate(row: PickRow) {
  if (row.sport !== "MLB") return row;

  const displayDate = getDisplayDate(row);
  if (!displayDate || displayDate === row.pick_date) return row;

  return {
    ...row,
    pick_date: displayDate,
  };
}

function getDedupeDate(row: PickRow) {
  if (row.sport === "MLB") return getDisplayDate(row) ?? row.pick_date ?? "";
  return row.pick_date ?? "";
}

function getDedupeKey(row: PickRow) {
  return [
    getDedupeDate(row),
    row.sport ?? "",
    row.market_scope ?? "",
    row.market_type ?? "",
    row.game_label ?? "",
    row.player_name ?? "",
    row.side ?? "",
    row.line_taken ?? "",
  ].join("::");
}

function getTimeValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isSettled(row: PickRow) {
  return Boolean(row.status && row.status !== "pending");
}

function choosePreferredPick(existing: PickRow, next: PickRow) {
  const existingSettled = isSettled(existing);
  const nextSettled = isSettled(next);

  if (existingSettled !== nextSettled) {
    return nextSettled ? next : existing;
  }

  const existingTime = Math.max(getTimeValue(existing.graded_at), getTimeValue(existing.created_at));
  const nextTime = Math.max(getTimeValue(next.graded_at), getTimeValue(next.created_at));

  return nextTime >= existingTime ? next : existing;
}

function dedupePicks(rows: PickRow[]) {
  const deduped = new Map<string, PickRow>();

  for (const row of rows) {
    const key = getDedupeKey(row);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    deduped.set(key, choosePreferredPick(existing, row));
  }

  return Array.from(deduped.values());
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const date = req.nextUrl.searchParams.get("date");
    const sport = req.nextUrl.searchParams.get("sport");
    const scope = req.nextUrl.searchParams.get("scope");

    const rows: PickRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("picks")
        .select("*")
        .order("is_top_pick", { ascending: false })
        .order("top_pick_rank", { ascending: true })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (sport) query = query.eq("sport", sport);
      if (scope) query = query.eq("market_scope", scope);
      if (date) {
        const includeMlbOvernightRows = !sport || sport === "MLB";
        const nextDate = includeMlbOvernightRows ? getNextDate(date) : null;
        query = nextDate ? query.in("pick_date", [date, nextDate]) : query.eq("pick_date", date);
      }

      const { data, error } = await query;

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const page = (data ?? []) as PickRow[];
      rows.push(...page);

      if (page.length < PAGE_SIZE) break;
    }

    let normalizedRows = rows.map(normalizePickDate);

    if (date) {
      normalizedRows = normalizedRows.filter((row) => row.pick_date === date);
    }

    normalizedRows = dedupePicks(normalizedRows);

    return NextResponse.json({ ok: true, data: normalizedRows });
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
