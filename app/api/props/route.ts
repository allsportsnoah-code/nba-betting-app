import { NextRequest, NextResponse } from "next/server";
import { getCachedData } from "@/lib/cache";
import { isNbaHighRiskStatus, type NbaInjuryReportRow, type NbaInjurySyncData } from "@/lib/nbaInjuries";
import {
  NBA_PROP_TYPES,
  isNbaPropType,
  parsePropMenuFromEventOdds,
  parsePropsFromEventOdds,
  PROP_MARKET_MAP,
  type NbaPropType,
} from "@/lib/propModel";
import { getResolvedNbaTeamOddsCache } from "@/lib/nbaOddsCache";
import { getRequestOrigin } from "@/lib/requestOrigin";

function normalizePlayerName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/\bjr\b/g, "")
    .replace(/\bsr\b/g, "")
    .replace(/\bii\b/g, "")
    .replace(/\biii\b/g, "")
    .replace(/\biv\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPropContext(row: any, injuryRows: NbaInjuryReportRow[]) {
  const injury = injuryRows.find(
    (entry) => normalizePlayerName(entry.playerName) === normalizePlayerName(row.player_name)
  );

  if (!injury) {
    return {
      context_note: null,
      context_risk_score: 0,
      risk_flags: [] as string[],
      available_for_board: true,
    };
  }

  const riskFlags: string[] = [];
  let contextRiskScore = 0;
  let availableForBoard = true;

  if (isNbaHighRiskStatus(injury.status)) {
    contextRiskScore =
      injury.status === "out" || injury.status === "inactive" || injury.status === "suspended"
        ? 40
        : injury.status === "doubtful"
        ? 32
        : Math.min(24, 8 + injury.impactScore * 4);
    riskFlags.push(`${injury.playerName} ${injury.statusLabel.toLowerCase()}`);
  }

  if (injury.status === "out" || injury.status === "inactive" || injury.status === "suspended" || injury.status === "doubtful") {
    availableForBoard = false;
  }

  if (injury.status === "questionable" && injury.impactScore >= 4) {
    riskFlags.push("high-impact questionable player");
  }

  return {
    context_note:
      riskFlags.length > 0
        ? `${riskFlags.join(", ")}${injury.reason ? ` (${injury.reason})` : ""}`
        : null,
    context_risk_score: contextRiskScore,
    risk_flags: riskFlags,
    available_for_board: availableForBoard,
  };
}

function enrichRowsWithContext<T extends Record<string, any>>(rows: T[], injuryRows: NbaInjuryReportRow[]) {
  return rows.map((row) => ({
    ...row,
    ...buildPropContext(row, injuryRows),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const propType = req.nextUrl.searchParams.get("propType") ?? "points";
    const origin = getRequestOrigin(req);
    const propTypes: NbaPropType[] = propType === "all" ? NBA_PROP_TYPES : isNbaPropType(propType) ? [propType] : [];

    if (propTypes.length === 0) {
      return NextResponse.json({ ok: false, error: "Invalid propType" }, { status: 400 });
    }

    const resolvedTeamOdds = await getResolvedNbaTeamOddsCache(day);
    let odds: any =
      resolvedTeamOdds.active?.businessDate
        ? {
            ok: true,
            businessDate: resolvedTeamOdds.active.businessDate,
            data: resolvedTeamOdds.active.data ?? [],
          }
        : null;

    if (!odds) {
      const oddsRes = await fetch(`${origin}/api/odds?day=${day}`, {
        cache: "no-store",
      });
      odds = await oddsRes.json();
    }

    if (!odds) {
      return NextResponse.json(
        { ok: false, error: "Failed to load NBA odds for props." },
        { status: 500 }
      );
    }

    if (!odds.ok) {
      return NextResponse.json(
        { ok: false, error: odds.error || "Failed to load NBA odds for props." },
        { status: 500 }
      );
    }

    const apiKey = process.env.ODDS_API_KEY;
    const marketKeys = propTypes.map((type) => PROP_MARKET_MAP[type].marketKey).join(",");
    const events = Array.isArray(odds.data) ? odds.data : [];
    const injurySyncData =
      (((await getCachedData(`nba_injury_report_${odds.businessDate}`))?.data ?? null) as NbaInjurySyncData | null);
    const injuryRows = injurySyncData?.rows ?? [];

    const propGroups = await Promise.all(
      events.map(async (event: any) => {
        const url =
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${event.id}/odds` +
          `?apiKey=${apiKey}` +
          `&regions=us` +
          `&markets=${marketKeys}` +
          `&oddsFormat=american` +
          `&bookmakers=draftkings`;

        const response = await fetch(url, { cache: "no-store" });
        const text = await response.text();

        if (!response.ok) {
          return {
            ok: false,
            eventId: event.id,
            gameLabel: `${event.away_team} @ ${event.home_team}`,
            error: `Props API failed: ${response.status}`,
            details: text,
            byType: {},
            auditMenu: [],
            rows: [],
          };
        }

        const eventOdds = JSON.parse(text);
        const byType = Object.fromEntries(
          propTypes.map((type) => [
            type,
            {
              auditMenu: enrichRowsWithContext(parsePropMenuFromEventOdds(eventOdds, type), injuryRows),
              rows: enrichRowsWithContext(parsePropsFromEventOdds(eventOdds, type), injuryRows),
            },
          ])
        ) as Record<NbaPropType, { auditMenu: any[]; rows: any[] }>;

        return {
          ok: true,
          eventId: event.id,
          gameLabel: `${event.away_team} @ ${event.home_team}`,
          byType,
          auditMenu: propTypes.flatMap((type) => byType[type].auditMenu),
          rows: propTypes.flatMap((type) => byType[type].rows),
        };
      })
    );

    const data = propGroups.flatMap((group) => group.rows);
    const failures = propGroups.filter((group) => !group.ok);

    if (data.length === 0 && failures.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: failures[0]?.error || "No NBA props were available.",
          failures,
        },
        { status: 500 }
      );
    }

    const byType = Object.fromEntries(
      propTypes.map((type) => {
        const rows = propGroups.flatMap((group) => group.byType?.[type]?.rows ?? []);
        const auditMenu = propGroups.flatMap((group) => group.byType?.[type]?.auditMenu ?? []);
        const typeFailures = failures.filter((group) => group.rows.length === 0);

        return [
          type,
          {
            ok: true,
            businessDate: odds.businessDate,
            propType: type,
            data: rows,
            auditMenu,
            diagnostics: {
              eventsChecked: events.length,
              eventsWithProps: propGroups.filter((group) => (group.byType?.[type]?.rows ?? []).length > 0).length,
              failedEvents: typeFailures.length,
            },
          },
        ];
      })
    );

    return NextResponse.json({
      ok: true,
      businessDate: odds.businessDate,
      propType,
      data,
      auditMenu: propGroups.flatMap((group) => group.auditMenu ?? []),
      byType,
      diagnostics: {
        eventsChecked: events.length,
        eventsWithProps: propGroups.filter((group) => group.rows.length > 0).length,
        failedEvents: failures.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
