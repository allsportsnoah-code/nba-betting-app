import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { PROP_MARKET_MAP } from "@/lib/propModel";

function propKey(row: any) {
  return `${row.game_label}|${row.player_name}|${row.side}|${row.line_taken}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const propType = req.nextUrl.searchParams.get("propType") ?? "points";
    const origin = req.nextUrl.origin;
    const now = new Date();

    if (!PROP_MARKET_MAP[propType]) {
      return NextResponse.json({ ok: false, error: "Invalid propType" }, { status: 400 });
    }

    const propsRes = await fetch(
      `${origin}/api/props?day=${day}&propType=${propType}`,
      { cache: "no-store" }
    );
    const props = await propsRes.json();

    if (!props.ok) {
      return NextResponse.json(
        { ok: false, error: props.error || "Failed to load props" },
        { status: 500 }
      );
    }

    const businessDate = props.businessDate;

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "player_prop")
      .eq("market_type", propType)
      .eq("is_top_pick", true)
      .order("top_pick_rank", { ascending: true });

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const rows = existingRows ?? [];
    const existingByKey = new Map(rows.map((r: any) => [propKey(r), r]));

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

    const lockedKeys = new Set(lockedRows.map((r: any) => propKey(r)));

    const candidates = (props.data ?? [])
      .filter((prop: any) => {
        if (!prop.commence_time) return true;
        return new Date(prop.commence_time) > now;
      })
      .filter((prop: any) => {
        const key = `${prop.game_label}|${prop.player_name}|${prop.official_side} ${prop.line}|${prop.line}`;
        return !lockedKeys.has(key);
      });

    const slotsOpen = Math.max(0, 3 - lockedRows.length);
    const selectedCandidates = candidates.slice(0, slotsOpen);

    const selectedKeys = new Set(
      selectedCandidates.map(
        (prop: any) =>
          `${prop.game_label}|${prop.player_name}|${prop.official_side} ${prop.line}|${prop.line}`
      )
    );

    for (const row of unlockedRows) {
      if (!selectedKeys.has(propKey(row))) {
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

    for (const prop of selectedCandidates) {
      const key = `${prop.game_label}|${prop.player_name}|${prop.official_side} ${prop.line}|${prop.line}`;
      const existing = existingByKey.get(key);

      const payload = {
        pick_date: businessDate,
        sport: "NBA",
        market_scope: "player_prop",
        market_type: propType,
        game_label: prop.game_label,
        home_team: prop.home_team,
        away_team: prop.away_team,
        player_name: prop.player_name,
        sportsbook: "DraftKings",
        side: `${prop.official_side} ${prop.line}`,
        line_taken: prop.line,
        odds_taken: prop.official_odds ?? -110,
        stake_units: 1,
        confidence_score: Math.min(prop.market_score, 100),
        projected_line: null,
        projected_home_score: null,
        projected_away_score: null,
        market_line: prop.line,
        edge: null,
        edge_label: prop.signal,
        is_top_pick: true,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: propType,
        external_event_id: prop.external_event_id,
        prop_stat_key: PROP_MARKET_MAP[propType].statKey,
        game_start_time: prop.commence_time ?? null,
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

    const ranked = finalItems.slice(0, 3);

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
      propType,
      data: ranked,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}