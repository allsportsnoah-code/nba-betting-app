import { NextRequest, NextResponse } from "next/server";
import { isAutomationRequest } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { getNbaSlateAvailability, getSoccerSlateAvailability } from "@/lib/slateAvailability";

async function callRoute(origin: string, path: string) {
  const secret = process.env.AUTO_SYNC_SECRET ?? "";
  const res = await fetch(`${origin}${path}`, {
    cache: "no-store",
    headers: secret ? { "x-auto-sync-secret": secret } : {},
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Auto sync failed for ${path}`);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAutomationRequest(req)) {
      return NextResponse.json({ ok: false, error: "Automation secret required." }, { status: 401 });
    }

    const task = req.nextUrl.searchParams.get("task") ?? "slate";
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = getRequestOrigin(req);
    const results: Record<string, unknown> = {};
    const runsBaseSlate = task === "slate";
    const runsNbaSlate = runsBaseSlate || task === "nba-slate" || task === "all";
    const runsMlbSlate = runsBaseSlate || task === "mlb-slate" || task === "all";
    const runsSoccerSlate = task === "soccer-slate" || task === "all";

    if (task === "nba-impact-rankings" || task === "all") {
      results.nbaImpactRankings = await callRoute(origin, "/api/sync-nba-impact-rankings");
    }

    if (runsNbaSlate) {
      const nbaAvailability = await getNbaSlateAvailability(day);
      results.nbaAvailability = nbaAvailability;

      if (nbaAvailability.ok && nbaAvailability.hasGames === false) {
        results.nbaSkipped = `No NBA games scheduled for ${nbaAvailability.businessDate}.`;
      } else {
        const nbaOdds = await callRoute(origin, `/api/sync-team-odds?day=${day}`);
        results.nbaOdds = nbaOdds;

        if ((nbaOdds as { gameCount?: number }).gameCount === 0) {
          results.nbaSkipped = `No NBA games found in odds slate for ${(nbaOdds as { businessDate?: string }).businessDate ?? day}.`;
        } else {
          results.nbaTop = await callRoute(origin, `/api/sync-top-picks?day=${day}`);
          results.nbaInjuries = await callRoute(origin, `/api/sync-nba-injuries?day=${day}`);
          if (task === "nba-slate" || task === "all") {
            results.nbaProps = await callRoute(origin, `/api/sync-props?day=${day}&propType=all`);
          }
        }
      }
    }

    if (task === "nba-hourly") {
      results.nbaInjuries = await callRoute(origin, `/api/sync-nba-injuries?day=${day}`);
    }

    if (runsMlbSlate) {
      results.mlbOdds = await callRoute(origin, `/api/sync-mlb-odds?day=${day}`);
      results.mlbTop = await callRoute(origin, `/api/sync-mlb-top-picks?day=${day}`);
      results.mlbTeamMarkets = await callRoute(origin, `/api/sync-mlb-team-markets-slate?day=${day}`);
      results.mlbProps = await callRoute(origin, `/api/sync-mlb-props-slate?day=${day}`);
    }

    if (runsSoccerSlate) {
      const worldCupAvailability = await getSoccerSlateAvailability("world_cup", day);
      results.soccerWorldCupAvailability = worldCupAvailability;

      if (worldCupAvailability.ok && worldCupAvailability.hasGames === false) {
        results.soccerWorldCupSkipped = `No World Cup games scheduled for ${worldCupAvailability.businessDate}.`;
      } else {
        const worldCupOdds = await callRoute(origin, `/api/sync-soccer-odds?competition=world_cup&day=${day}`);
        results.soccerWorldCup = worldCupOdds;

        if ((worldCupOdds as { gameCount?: number }).gameCount === 0) {
          results.soccerWorldCupSkipped = `No World Cup games found in odds slate for ${(worldCupOdds as { businessDate?: string }).businessDate ?? day}.`;
        } else {
          results.soccerWorldCupProps = await callRoute(origin, `/api/sync-soccer-props?competition=world_cup&day=${day}`);
        }
      }

      const mlsAvailability = await getSoccerSlateAvailability("mls", day);
      results.soccerMlsAvailability = mlsAvailability;

      if (mlsAvailability.ok && mlsAvailability.hasGames === false) {
        results.soccerMlsSkipped = `No MLS games scheduled for ${mlsAvailability.businessDate}.`;
      } else {
        const mlsOdds = await callRoute(origin, `/api/sync-soccer-odds?competition=mls&day=${day}`);
        results.soccerMls = mlsOdds;

        if ((mlsOdds as { gameCount?: number }).gameCount === 0) {
          results.soccerMlsSkipped = `No MLS games found in odds slate for ${(mlsOdds as { businessDate?: string }).businessDate ?? day}.`;
        } else {
          results.soccerMlsProps = await callRoute(origin, `/api/sync-soccer-props?competition=mls&day=${day}`);
        }
      }
    }

    if (task === "grade" || task === "all") {
      results.grade = await callRoute(origin, "/api/grade-picks");
    }

    return NextResponse.json({ ok: true, task, day, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
