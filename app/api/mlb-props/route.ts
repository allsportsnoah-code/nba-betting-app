import { NextRequest, NextResponse } from "next/server";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import {
  evaluateMlbPlayerProps,
  getMlbPropMarketTypes,
  MLB_PROP_MARKET_MAP,
  type MlbPropOddsEvent,
  type MlbPropType,
} from "@/lib/mlbPropModel";

function parseMarketTypes(param: string | null, coreMarketsOnly: boolean): MlbPropType[] {
  if (!param) return getMlbPropMarketTypes(!coreMarketsOnly);

  return param
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is MlbPropType => value in MLB_PROP_MARKET_MAP);
}

export async function GET(req: NextRequest) {
  try {
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const eventId = req.nextUrl.searchParams.get("eventId");
    const coreMarketsOnly =
      req.nextUrl.searchParams.get("coreMarketsOnly") === "1" ||
      req.nextUrl.searchParams.get("coreMarketsOnly") === "true";
    const marketTypes = parseMarketTypes(req.nextUrl.searchParams.get("marketTypes"), coreMarketsOnly);
    const resolvedOdds = await getResolvedMlbOddsCache(day);
    const cachedOdds = (resolvedOdds.active as {
      businessDate?: string;
      data?: MlbOddsGame[];
      learning?: MlbLearningProfile;
    } | null) ?? null;

    if (!cachedOdds?.businessDate) {
      return NextResponse.json(
        {
          ok: false,
          error: `No cached MLB odds found for betting day ${resolvedOdds.expectedBusinessDate}. Sync MLB odds first.`,
        },
        { status: 400 }
      );
    }

    const event = (cachedOdds.data ?? []).find((game) => game.id === eventId) as MlbPropOddsEvent | undefined;
    if (!event || !eventId) {
      return NextResponse.json({ ok: false, error: "Game not found in cached MLB odds." }, { status: 404 });
    }

    const apiKey = process.env.ODDS_API_KEY;
    const markets = marketTypes.map((type) => MLB_PROP_MARKET_MAP[type].marketKey).join(",");
    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&markets=${markets}` +
      `&oddsFormat=american` +
      `&bookmakers=draftkings`;

    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `MLB props API failed: ${response.status}`, details: text },
        { status: 500 }
      );
    }

    const eventOdds = JSON.parse(text) as MlbPropOddsEvent;
    const result = await evaluateMlbPlayerProps({
      event: eventOdds,
      businessDate: cachedOdds.businessDate,
      marketTypes,
      learningProfile: cachedOdds.learning ?? null,
    });

    return NextResponse.json({
      ok: true,
      businessDate: cachedOdds.businessDate,
      eventId,
      gameLabel: `${eventOdds.away_team} @ ${eventOdds.home_team}`,
      marketTypes,
      data: result.candidates,
      auditRows: result.auditCandidates,
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
