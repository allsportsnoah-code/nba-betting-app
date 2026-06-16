import { NextRequest, NextResponse } from "next/server";
import { getCachedData } from "@/lib/cache";
import { captureNbaHistorySnapshot } from "@/lib/nbaHistorySnapshot";
import { setNbaPropAuditSnapshot } from "@/lib/futureAudit";
import {
  buildNbaPropLearningProfile,
  getNbaPropSelectionThreshold,
  buildNbaPropTopScore,
  buildNbaPropValueScore,
} from "@/lib/nbaPropLearning";
import { buildPropMarketScore, isNbaPropType, PROP_MARKET_MAP } from "@/lib/propModel";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getRequestOrigin } from "@/lib/requestOrigin";

function propKey(row: any) {
  return `${row.game_label}|${row.player_name}|${row.side}|${row.line_taken}`;
}

function buildCandidateKey(prop: any) {
  return `${prop.game_label}|${prop.player_name}|${prop.official_side} ${prop.line}|${prop.line}`;
}

function buildCandidateConflictKey(prop: any) {
  return `${prop.game_label}|${prop.player_name}|${prop.line}`;
}

function buildRowConflictKey(row: any) {
  return `${row.game_label}|${row.player_name}|${row.line_taken}`;
}

function toNbaPropScoreInput(prop: any) {
  return {
    ...prop,
    marketType: prop.marketType ?? prop.market_type ?? prop.prop_type,
    side:
      prop.side ??
      (prop.official_side && prop.line !== null && prop.line !== undefined
        ? `${prop.official_side} ${prop.line}`
        : null),
    marketScore: Number(prop.marketScore ?? prop.market_score ?? 0),
    oddsTaken: prop.oddsTaken ?? prop.odds_taken ?? prop.official_odds ?? null,
  };
}

function selectNbaPropCandidates(params: {
  candidates: any[];
  limit: number;
  bucket: "top" | "value";
  learningProfile: Awaited<ReturnType<typeof buildNbaPropLearningProfile>>;
  blockedConflictKeys?: Set<string>;
}) {
  const selected: any[] = [];
  const usedConflictKeys = new Set(params.blockedConflictKeys ?? []);

  for (const candidate of params.candidates) {
    if (!isContextAdjustedNbaPropEligibleForBoard(candidate, params.bucket, params.learningProfile)) continue;

    const conflictKey = buildCandidateConflictKey(candidate);
    if (usedConflictKeys.has(conflictKey)) continue;

    selected.push(candidate);
    usedConflictKeys.add(conflictKey);

    if (selected.length >= params.limit) break;
  }

  return selected;
}

function getPropContextRiskPenalty(prop: any, bucket: "top" | "value") {
  const riskScore = Number(prop.context_risk_score ?? 0);
  return riskScore * (bucket === "top" ? 0.4 : 0.3);
}

function buildContextAdjustedNbaPropTopScore(
  prop: any,
  learningProfile: Awaited<ReturnType<typeof buildNbaPropLearningProfile>>
) {
  const input = toNbaPropScoreInput(prop);
  return Number((buildNbaPropTopScore(input, learningProfile) - getPropContextRiskPenalty(input, "top")).toFixed(1));
}

function buildContextAdjustedNbaPropValueScore(
  prop: any,
  learningProfile: Awaited<ReturnType<typeof buildNbaPropLearningProfile>>
) {
  const input = toNbaPropScoreInput(prop);
  return Number((buildNbaPropValueScore(input, learningProfile) - getPropContextRiskPenalty(input, "value")).toFixed(1));
}

function isContextAdjustedNbaPropEligibleForBoard(
  prop: any,
  bucket: "top" | "value",
  learningProfile: Awaited<ReturnType<typeof buildNbaPropLearningProfile>>
) {
  if (prop.available_for_board === false) return false;
  const score =
    bucket === "top"
      ? buildContextAdjustedNbaPropTopScore(prop, learningProfile)
      : buildContextAdjustedNbaPropValueScore(prop, learningProfile);
  return score >= getNbaPropSelectionThreshold(toNbaPropScoreInput(prop), bucket, learningProfile);
}

function buildNbaPropAuditRows(params: {
  propType: string;
  auditMenu: any[];
  learningProfile: Awaited<ReturnType<typeof buildNbaPropLearningProfile>>;
  selectedTopKeys: Set<string>;
  selectedBestValueKeys: Set<string>;
}) {
  const rows: any[] = [];

  for (const row of params.auditMenu ?? []) {
    const scoredSides = (["Over", "Under"] as const)
      .map((side) => {
        const oddsTaken = side === "Over" ? row.over_odds ?? null : row.under_odds ?? null;
        if (oddsTaken === null || oddsTaken === undefined) return null;

        const sideRow = {
          marketType: params.propType,
          side: `${side} ${row.line}`,
          oddsTaken,
          marketScore: buildPropMarketScore(oddsTaken, row.line),
          context_risk_score: row.context_risk_score ?? 0,
          available_for_board: row.available_for_board ?? true,
        };

        return {
          side,
          sideLabel: `${side} ${row.line}`,
          oddsTaken,
          sideRow,
          topScore: buildContextAdjustedNbaPropTopScore(sideRow, params.learningProfile),
          valueScore: buildContextAdjustedNbaPropValueScore(sideRow, params.learningProfile),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const modelPreferredSide =
      [...scoredSides].sort(
        (a, b) =>
          Math.max(b.topScore, b.valueScore) - Math.max(a.topScore, a.valueScore) ||
          b.sideRow.marketScore - a.sideRow.marketScore
      )[0]?.sideLabel ?? null;

    for (const side of ["Over", "Under"] as const) {
      const oddsTaken = side === "Over" ? row.over_odds ?? null : row.under_odds ?? null;
      if (oddsTaken === null || oddsTaken === undefined) continue;

      const scoredSide = scoredSides.find((entry) => entry.side === side);
      const sideRow = scoredSide?.sideRow ?? {
        marketType: params.propType,
        side: `${side} ${row.line}`,
        oddsTaken,
        marketScore: buildPropMarketScore(oddsTaken, row.line),
        context_risk_score: row.context_risk_score ?? 0,
        available_for_board: row.available_for_board ?? true,
      };
      const candidateKey = `${row.game_label}|${row.player_name}|${side} ${row.line}|${row.line}`;
      rows.push({
        externalEventId: row.external_event_id,
        gameLabel: row.game_label,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        commenceTime: row.commence_time ?? null,
        propType: params.propType,
        playerName: row.player_name,
        line: row.line ?? null,
        side: `${side} ${row.line}`,
        oddsTaken,
        marketScore: sideRow.marketScore,
        topScore: scoredSide?.topScore ?? buildContextAdjustedNbaPropTopScore(sideRow, params.learningProfile),
        valueScore: scoredSide?.valueScore ?? buildContextAdjustedNbaPropValueScore(sideRow, params.learningProfile),
        currentThresholdTop: getNbaPropSelectionThreshold(sideRow, "top", params.learningProfile),
        currentThresholdValue: getNbaPropSelectionThreshold(sideRow, "value", params.learningProfile),
        currentTopEligible: isContextAdjustedNbaPropEligibleForBoard(sideRow, "top", params.learningProfile),
        currentBestValueEligible: isContextAdjustedNbaPropEligibleForBoard(sideRow, "value", params.learningProfile),
        currentModelPreferredSide: modelPreferredSide,
        selectedForCurrentCandidatePool:
          params.selectedTopKeys.has(candidateKey) || params.selectedBestValueKeys.has(candidateKey),
        contextNote: row.context_note ?? null,
        contextRiskScore: row.context_risk_score ?? 0,
        riskFlags: row.risk_flags ?? [],
        availableForBoard: row.available_for_board ?? true,
      });
    }
  }

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const requestedPropType = req.nextUrl.searchParams.get("propType") ?? "points";
    const useCachedProps = req.nextUrl.searchParams.get("useCache") === "1";
    const origin = getRequestOrigin(req);
    const now = new Date();

    if (!isNbaPropType(requestedPropType)) {
      return NextResponse.json({ ok: false, error: "Invalid propType" }, { status: 400 });
    }
    const propType = requestedPropType;

    const cachedPropsRow = useCachedProps ? await getCachedData(`props_${day}_${propType}`) : null;
    const cachedProps = (cachedPropsRow?.data as any | null) ?? null;
    let props = cachedProps?.ok && cachedProps.propType === propType ? cachedProps : null;

    if (!props) {
      const propsRes = await fetch(`${origin}/api/props?day=${day}&propType=${propType}`, {
        cache: "no-store",
      });
      props = await propsRes.json();
    }

    if (!props.ok) {
      return NextResponse.json(
        { ok: false, error: props.error || "Failed to load props" },
        { status: 500 }
      );
    }

    const businessDate = props.businessDate;
    const learningProfile = await buildNbaPropLearningProfile();

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "player_prop")
      .eq("market_type", propType)
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
    const lockedConflictKeys = new Set(lockedRows.map((r: any) => buildRowConflictKey(r)));
    const lockedTopRows = lockedRows.filter((row: any) => row.is_top_pick);
    const lockedBestValueRows = lockedRows.filter((row: any) => row.notes === "best_value");

    const candidates = (props.data ?? [])
      .filter((prop: any) => {
        if (!prop.commence_time) return true;
        return new Date(prop.commence_time) > now;
      })
      .filter((prop: any) => prop.available_for_board !== false)
      .filter((prop: any) => !lockedKeys.has(buildCandidateKey(prop)))
      .filter((prop: any) => !lockedConflictKeys.has(buildCandidateConflictKey(prop)))
      .sort(
        (a: any, b: any) =>
          buildContextAdjustedNbaPropTopScore(b, learningProfile) - buildContextAdjustedNbaPropTopScore(a, learningProfile) ||
          buildContextAdjustedNbaPropValueScore(b, learningProfile) - buildContextAdjustedNbaPropValueScore(a, learningProfile) ||
          (b.market_score ?? 0) - (a.market_score ?? 0)
      );

    const topSlotsOpen = Math.max(0, 3 - lockedTopRows.length);
    const selectedTopCandidates = selectNbaPropCandidates({
      candidates,
      limit: topSlotsOpen,
      bucket: "top",
      learningProfile,
      blockedConflictKeys: lockedConflictKeys,
    });
    const selectedTopKeys = new Set<string>(
      selectedTopCandidates.map((prop: any) => buildCandidateKey(prop))
    );
    const selectedTopConflictKeys = new Set<string>([
      ...lockedConflictKeys,
      ...selectedTopCandidates.map((prop: any) => buildCandidateConflictKey(prop)),
    ]);

    const bestValueCandidates = candidates
      .filter((prop: any) => !selectedTopKeys.has(buildCandidateKey(prop)))
      .filter((prop: any) => !selectedTopConflictKeys.has(buildCandidateConflictKey(prop)))
      .sort(
        (a: any, b: any) =>
          buildContextAdjustedNbaPropValueScore(b, learningProfile) - buildContextAdjustedNbaPropValueScore(a, learningProfile) ||
          buildContextAdjustedNbaPropTopScore(b, learningProfile) - buildContextAdjustedNbaPropTopScore(a, learningProfile) ||
          (b.market_score ?? 0) - (a.market_score ?? 0)
      );
    const bestValueSlotsOpen = Math.max(0, 3 - lockedBestValueRows.length);
    const selectedBestValueCandidates = selectNbaPropCandidates({
      candidates: bestValueCandidates,
      limit: bestValueSlotsOpen,
      bucket: "value",
      learningProfile,
      blockedConflictKeys: selectedTopConflictKeys,
    });
    const selectedBestValueKeys = new Set<string>(
      selectedBestValueCandidates.map((prop: any) => buildCandidateKey(prop))
    );
    await setNbaPropAuditSnapshot({
      pickDate: businessDate,
      propType,
      diagnostics: props.diagnostics ?? null,
      rows: buildNbaPropAuditRows({
        propType,
        auditMenu: props.auditMenu ?? [],
        learningProfile,
        selectedTopKeys,
        selectedBestValueKeys,
      }),
    });

    for (const row of unlockedRows) {
      if (!selectedTopKeys.has(propKey(row)) && !selectedBestValueKeys.has(propKey(row))) {
        await supabase
          .from("picks")
          .update({
            is_top_pick: false,
            top_pick_rank: null,
            notes: null,
          })
          .eq("id", row.id);
      }
    }

    const finalTopItems: any[] = [...lockedTopRows];
    const finalBestValueItems: any[] = [...lockedBestValueRows];

    for (const prop of selectedTopCandidates) {
      const key = buildCandidateKey(prop);
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
        confidence_score: Math.min(buildContextAdjustedNbaPropTopScore(prop, learningProfile), 100),
        projected_line: null,
        projected_home_score: null,
        projected_away_score: null,
        market_line: prop.line,
        edge: null,
        edge_label: [prop.signal, prop.context_note ? `Watch: ${prop.context_note}` : null]
          .filter(Boolean)
          .join(" | "),
        is_top_pick: true,
        top_pick_rank: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: null,
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

        if (updated) finalTopItems.push(updated);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) finalTopItems.push(inserted);
      } else if (existing?.locked_at) {
        finalTopItems.push(existing);
      }
    }

    for (const prop of selectedBestValueCandidates) {
      const key = buildCandidateKey(prop);
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
        confidence_score: Math.min(buildContextAdjustedNbaPropValueScore(prop, learningProfile), 100),
        projected_line: null,
        projected_home_score: null,
        projected_away_score: null,
        market_line: prop.line,
        edge: null,
        edge_label: [prop.signal, prop.context_note ? `Watch: ${prop.context_note}` : null]
          .filter(Boolean)
          .join(" | "),
        is_top_pick: false,
        top_pick_rank: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: "best_value",
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

        if (updated) finalBestValueItems.push(updated);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) finalBestValueItems.push(inserted);
      } else if (existing?.locked_at) {
        finalBestValueItems.push(existing);
      }
    }

    const ranked = finalTopItems.slice(0, 3);

    for (let i = 0; i < ranked.length; i++) {
      const row = ranked[i];
      await supabase
        .from("picks")
        .update({ top_pick_rank: i + 1 })
        .eq("id", row.id);
      row.top_pick_rank = i + 1;
    }

    await captureNbaHistorySnapshot(businessDate);

    return NextResponse.json({
      ok: true,
      businessDate,
      propType,
      topPicks: ranked,
      bestValues: finalBestValueItems.slice(0, 3),
      data: ranked,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
