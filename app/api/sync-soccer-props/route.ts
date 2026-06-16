import { NextRequest } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getResolvedSoccerOddsCache, normalizeSoccerCompetition } from "@/lib/soccerOddsCache";
import type { SoccerCompetitionKey, SoccerOddsGame, SoccerOddsOutcome } from "@/lib/soccerModel";
import {
  SOCCER_CORE_PROP_MARKET_KEYS,
  getSoccerPropMarketDefinition,
  getSoccerPropSnapshotCacheKey,
  labelForSoccerGame,
  type SoccerCoverageCandidate,
  type SoccerPropSnapshot,
  type SoccerPropSnapshotRow,
} from "@/lib/soccerProps";

type EventMarketDiscoveryResponse = {
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{ key?: string; last_update?: string }>;
  }>;
};

type EventOddsResponse = SoccerOddsGame;

function getOddsApiKey() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_KEY is not configured.");
  }
  return apiKey;
}

async function fetchOddsApiJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), { cache: "no-store" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Odds API failed: ${response.status} ${text.slice(0, 240)}`);
  }

  return JSON.parse(text) as T;
}

function getAvailableMarketKeys(response: EventMarketDiscoveryResponse) {
  return Array.from(
    new Set(
      (response.bookmakers ?? [])
        .flatMap((bookmaker) => bookmaker.markets ?? [])
        .map((market) => market.key)
        .filter((key): key is string => Boolean(key))
    )
  ).sort();
}

function buildEventMarketsUrl(params: {
  sportKey: string;
  eventId: string;
  apiKey: string;
}) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${params.sportKey}/events/${params.eventId}/markets`);
  url.searchParams.set("apiKey", params.apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("bookmakers", "draftkings");
  url.searchParams.set("dateFormat", "iso");
  return url;
}

function buildEventOddsUrl(params: {
  sportKey: string;
  eventId: string;
  apiKey: string;
  marketKeys: string[];
}) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${params.sportKey}/events/${params.eventId}/odds`);
  url.searchParams.set("apiKey", params.apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("bookmakers", "draftkings");
  url.searchParams.set("markets", params.marketKeys.join(","));
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  return url;
}

function normalizeOutcomeSide(outcome: SoccerOddsOutcome) {
  const point = outcome.point === undefined || outcome.point === null ? "" : ` ${outcome.point}`;
  return `${outcome.name}${point}`.trim();
}

function americanToProfitPerUnit(odds: number) {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function getMarket(eventOdds: EventOddsResponse, marketKey: string) {
  for (const bookmaker of eventOdds.bookmakers ?? []) {
    const market = bookmaker.markets?.find((entry) => entry.key === marketKey);
    if (market) return market;
  }

  return null;
}

function getOutcomePrice(eventOdds: EventOddsResponse, marketKey: string, outcomeName: string) {
  const market = getMarket(eventOdds, marketKey);
  return market?.outcomes?.find((outcome) => outcome.name === outcomeName)?.price ?? null;
}

function getEqualProfitSplit(firstOdds: number, secondOdds: number) {
  const firstProfit = americanToProfitPerUnit(firstOdds);
  const secondProfit = americanToProfitPerUnit(secondOdds);
  const firstStakeShare = (secondProfit + 1) / (firstProfit + secondProfit + 2);
  const secondStakeShare = 1 - firstStakeShare;
  const profitIfFirstWins = firstStakeShare * firstProfit - secondStakeShare;
  const profitIfSecondWins = secondStakeShare * secondProfit - firstStakeShare;

  return {
    firstStakeShare,
    secondStakeShare,
    profitIfFirstWins,
    profitIfSecondWins,
    worstProfit: Math.min(profitIfFirstWins, profitIfSecondWins),
  };
}

function findDoubleChanceOutcome(eventOdds: EventOddsResponse, coveredOutcomes: string[]) {
  const market = getMarket(eventOdds, "double_chance");
  const normalizedCovered = coveredOutcomes.map((value) => value.toLowerCase()).sort().join("::");

  return market?.outcomes?.find((outcome) => {
    const normalized = outcome.name.toLowerCase();
    const parts = normalized
      .split(/\s+or\s+/)
      .map((part) => part.trim())
      .sort()
      .join("::");
    return parts === normalizedCovered;
  }) ?? null;
}

function buildCoverageCandidates(params: {
  competition: SoccerCompetitionKey;
  businessDate: string;
  eventOdds: EventOddsResponse;
}) {
  const home = params.eventOdds.home_team;
  const away = params.eventOdds.away_team;
  const draw = "Draw";
  const homeOdds = getOutcomePrice(params.eventOdds, "h2h", home);
  const awayOdds = getOutcomePrice(params.eventOdds, "h2h", away);
  const drawOdds = getOutcomePrice(params.eventOdds, "h2h", draw);
  const definitions = [
    {
      coverage: "home_or_draw" as const,
      label: `${home} or Draw`,
      first: home,
      second: draw,
      firstOdds: homeOdds,
      secondOdds: drawOdds,
      uncoveredOutcome: away,
    },
    {
      coverage: "away_or_draw" as const,
      label: `${away} or Draw`,
      first: away,
      second: draw,
      firstOdds: awayOdds,
      secondOdds: drawOdds,
      uncoveredOutcome: home,
    },
    {
      coverage: "home_or_away" as const,
      label: `${home} or ${away}`,
      first: home,
      second: away,
      firstOdds: homeOdds,
      secondOdds: awayOdds,
      uncoveredOutcome: draw,
    },
  ];
  const candidates: SoccerCoverageCandidate[] = [];

  for (const definition of definitions) {
    const doubleChance = findDoubleChanceOutcome(params.eventOdds, [definition.first, definition.second]);
    const split =
      definition.firstOdds !== null && definition.secondOdds !== null
        ? getEqualProfitSplit(definition.firstOdds, definition.secondOdds)
        : null;
    const bookProfitPerUnit = doubleChance ? americanToProfitPerUnit(doubleChance.price) : null;
    const manualWorstProfit = split?.worstProfit ?? null;
    const betterPrice =
      bookProfitPerUnit === null && manualWorstProfit === null
        ? "unavailable"
        : bookProfitPerUnit !== null && (manualWorstProfit === null || bookProfitPerUnit >= manualWorstProfit)
          ? "double_chance"
          : "manual_split";

    candidates.push({
      id: `${params.eventOdds.id}::${definition.coverage}`,
      competition: params.competition,
      businessDate: params.businessDate,
      eventId: params.eventOdds.id,
      gameLabel: labelForSoccerGame(params.eventOdds),
      commenceTime: params.eventOdds.commence_time,
      coverage: definition.coverage,
      label: definition.label,
      bookSide: doubleChance?.name ?? null,
      bookOdds: doubleChance?.price ?? null,
      manualLegs:
        split && definition.firstOdds !== null && definition.secondOdds !== null
          ? [
              {
                side: definition.first,
                odds: definition.firstOdds,
                stakeShare: Number(split.firstStakeShare.toFixed(4)),
              },
              {
                side: definition.second,
                odds: definition.secondOdds,
                stakeShare: Number(split.secondStakeShare.toFixed(4)),
              },
            ]
          : [],
      manualProfitIfFirstWins: split ? Number(split.profitIfFirstWins.toFixed(4)) : null,
      manualProfitIfSecondWins: split ? Number(split.profitIfSecondWins.toFixed(4)) : null,
      bookProfitPerUnit: bookProfitPerUnit === null ? null : Number(bookProfitPerUnit.toFixed(4)),
      betterPrice,
      coveredOutcomes: [definition.first, definition.second],
      uncoveredOutcome: definition.uncoveredOutcome,
      notes: [
        betterPrice === "double_chance"
          ? "Book double chance pays at least as well as a balanced manual split."
          : betterPrice === "manual_split"
            ? "Manual split beats the listed double chance payout."
            : "Missing prices for this coverage structure.",
      ],
    });
  }

  return candidates;
}

function flattenEventOdds(params: {
  competition: SoccerCompetitionKey;
  businessDate: string;
  capturedAt: string;
  eventOdds: EventOddsResponse;
}) {
  const rows: SoccerPropSnapshotRow[] = [];
  const coverageCandidates: SoccerCoverageCandidate[] = [];
  const gameLabel = labelForSoccerGame(params.eventOdds);

  for (const bookmaker of params.eventOdds.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      const definition = getSoccerPropMarketDefinition(market.key);

      for (const outcome of market.outcomes ?? []) {
        if (outcome.price === null || outcome.price === undefined) continue;

        rows.push({
          snapshotId: [
            params.eventOdds.id,
            market.key,
            outcome.description ?? "match",
            normalizeOutcomeSide(outcome),
            outcome.price,
          ].join("::"),
          competition: params.competition,
          businessDate: params.businessDate,
          eventId: params.eventOdds.id,
          gameLabel,
          commenceTime: params.eventOdds.commence_time,
          homeTeam: params.eventOdds.home_team,
          awayTeam: params.eventOdds.away_team,
          bookmaker: bookmaker.title ?? bookmaker.key ?? "DraftKings",
          marketKey: market.key,
          marketLabel: definition.label,
          category: definition.category,
          playerName: outcome.description ?? null,
          side: normalizeOutcomeSide(outcome),
          point: outcome.point ?? null,
          price: outcome.price,
          lastUpdate: (market as { last_update?: string }).last_update ?? null,
          capturedAt: params.capturedAt,
        });
      }
    }
  }

  return rows;
}

function groupSnapshotRowsByEvent<T extends { eventId: string }>(rows: T[]) {
  const byEvent = new Map<string, T[]>();

  for (const row of rows) {
    const existing = byEvent.get(row.eventId) ?? [];
    existing.push(row);
    byEvent.set(row.eventId, existing);
  }

  return byEvent;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const competition = normalizeSoccerCompetition(req.nextUrl.searchParams.get("competition"));
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const forceRefresh =
      req.nextUrl.searchParams.get("force") === "1" ||
      req.nextUrl.searchParams.get("force") === "true";
    const resolvedOdds = await getResolvedSoccerOddsCache(competition, day);
    const cachedOdds = resolvedOdds.active;

    if (!cachedOdds?.businessDate) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: `No cached soccer odds found for ${resolvedOdds.expectedBusinessDate}. Sync soccer odds first.`,
        },
        { status: 400 },
        { fallbackPath: "/soccer" }
      );
    }

    const games = (cachedOdds.data ?? []) as SoccerOddsGame[];
    const capturedAt = new Date().toISOString();
    const snapshotCacheKey = getSoccerPropSnapshotCacheKey(competition, cachedOdds.businessDate);
    const previousSnapshotRow = await getCachedData(snapshotCacheKey);
    const previousSnapshot = (previousSnapshotRow?.data as SoccerPropSnapshot | null) ?? null;
    const reusableSnapshot =
      previousSnapshot?.businessDate === cachedOdds.businessDate &&
      previousSnapshot.competition === competition
        ? previousSnapshot
        : null;
    const previousGamesById = new Map((reusableSnapshot?.games ?? []).map((game) => [game.eventId, game]));
    const previousRowsByEvent = groupSnapshotRowsByEvent(reusableSnapshot?.rows ?? []);
    const previousCoverageByEvent = groupSnapshotRowsByEvent(reusableSnapshot?.coverageCandidates ?? []);
    const snapshotGames: SoccerPropSnapshot["games"] = [];
    const rows: SoccerPropSnapshotRow[] = [];
    const coverageCandidates: SoccerCoverageCandidate[] = [];
    const now = new Date();

    if (games.length === 0) {
      const snapshot: SoccerPropSnapshot = {
        competition,
        businessDate: cachedOdds.businessDate,
        capturedAt,
        games: [],
        rows: [],
        coverageCandidates: [],
      };

      await setCachedData(snapshotCacheKey, snapshot);

      return apiJsonOrNativeRedirect(
        req,
        {
          ok: true,
          skipped: true,
          competition,
          businessDate: cachedOdds.businessDate,
          message: `No ${competition === "world_cup" ? "World Cup" : "MLS"} games found for ${cachedOdds.businessDate}. Soccer props sync skipped.`,
          games: 0,
          rows: 0,
          coverageCandidates: 0,
          markets: [],
        },
        undefined,
        { fallbackPath: "/soccer" }
      );
    }

    const apiKey = getOddsApiKey();

    for (const game of games) {
      if (!game.sport_key || !game.id) continue;

      const previousGame = previousGamesById.get(game.id);
      const previousRows = previousRowsByEvent.get(game.id) ?? [];
      const previousCoverageCandidates = previousCoverageByEvent.get(game.id) ?? [];
      const gameStart = new Date(game.commence_time);
      const alreadyStarted = !Number.isNaN(gameStart.getTime()) && gameStart <= now;
      const canReuseSnapshot =
        !forceRefresh &&
        previousGame &&
        previousGame.syncedMarketKeys.length > 0;

      if (alreadyStarted || canReuseSnapshot) {
        rows.push(...previousRows);
        coverageCandidates.push(...previousCoverageCandidates);
        snapshotGames.push({
          eventId: game.id,
          gameLabel: labelForSoccerGame(game),
          commenceTime: game.commence_time,
          availableMarketKeys: previousGame?.availableMarketKeys ?? [],
          syncedMarketKeys: previousGame?.syncedMarketKeys ?? [],
          reusedFromSnapshot: previousRows.length > 0 || previousCoverageCandidates.length > 0,
          skippedReason: alreadyStarted ? "already_started" : "already_synced",
        });
        continue;
      }

      const discovery = await fetchOddsApiJson<EventMarketDiscoveryResponse>(
        buildEventMarketsUrl({
          sportKey: game.sport_key,
          eventId: game.id,
          apiKey,
        })
      );
      const availableMarketKeys = getAvailableMarketKeys(discovery);
      const syncedMarketKeys = SOCCER_CORE_PROP_MARKET_KEYS.filter((key) => availableMarketKeys.includes(key));
      const oddsMarketKeys = [...syncedMarketKeys];

      if (availableMarketKeys.includes("h2h") && !oddsMarketKeys.includes("h2h")) {
        oddsMarketKeys.push("h2h");
      }

      if (oddsMarketKeys.length > 0) {
        const eventOdds = await fetchOddsApiJson<EventOddsResponse>(
          buildEventOddsUrl({
            sportKey: game.sport_key,
            eventId: game.id,
            apiKey,
            marketKeys: oddsMarketKeys,
          })
        );
        rows.push(
          ...flattenEventOdds({
            competition,
            businessDate: cachedOdds.businessDate,
            capturedAt,
            eventOdds,
          })
        );
        coverageCandidates.push(
          ...buildCoverageCandidates({
            competition,
            businessDate: cachedOdds.businessDate,
            eventOdds,
          })
        );
      }

      snapshotGames.push({
        eventId: game.id,
        gameLabel: labelForSoccerGame(game),
        commenceTime: game.commence_time,
        availableMarketKeys,
        syncedMarketKeys: oddsMarketKeys,
      });
    }

    const snapshot: SoccerPropSnapshot = {
      competition,
      businessDate: cachedOdds.businessDate,
      capturedAt,
      games: snapshotGames,
      rows,
      coverageCandidates,
    };

    await setCachedData(snapshotCacheKey, snapshot);

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        competition,
        businessDate: cachedOdds.businessDate,
        message: `Synced ${rows.length} soccer prop and derivative market lines.`,
        games: snapshotGames.length,
        rows: rows.length,
        coverageCandidates: coverageCandidates.length,
        markets: Array.from(new Set(rows.map((row) => row.marketKey))).sort(),
      },
      undefined,
      { fallbackPath: "/soccer" }
    );
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/soccer" }
    );
  }
}
