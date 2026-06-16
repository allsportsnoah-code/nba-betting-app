import { getCachedData, setCachedData } from "@/lib/cache";

export type MlbPickGameReviewVerdict =
  | "fine_loss"
  | "normal_loss"
  | "bad_loss"
  | "not_loss"
  | "unknown";

export type MlbPickGameReview = {
  pickId: number;
  generatedAt: string;
  gamePk: number | null;
  sourceUrl: string | null;
  pickDate: string | null;
  gameLabel: string | null;
  marketType: string | null;
  selectedTeam: string | null;
  selectedTeamRole: "home" | "away" | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  finalInnings: number | null;
  lineTaken: number | null;
  verdict: MlbPickGameReviewVerdict;
  verdictLabel: string;
  shouldSoftenLearning: boolean;
  learningWeightMultiplier: number;
  summary: string;
  reasons: string[];
  flow: {
    gradedInnings: number;
    coveredAfterInnings: number;
    ledAfterInnings: number;
    tiedAfterInnings: number;
    coverRate: number;
    leadRate: number;
    coveredAfterFive: boolean | null;
    coveredAfterSeven: boolean | null;
    coveredAfterEight: boolean | null;
    ledAfterFive: boolean | null;
    ledAfterSeven: boolean | null;
    ledAfterEight: boolean | null;
    firstLostCoverInning: number | null;
    lastCoveredInning: number | null;
    finalCoverValue: number | null;
    failedByRuns: number | null;
    totalRunsAfterFive: number | null;
    lateRunsAfterFive: number | null;
    lateCoverLoss: boolean;
    extraInnings: boolean;
  };
  keyPlays: Array<{
    inning: number | null;
    halfInning: string | null;
    description: string;
    homeScore: number | null;
    awayScore: number | null;
    coverValue: number | null;
    status: "covering" | "pushing" | "not_covering" | "unknown";
  }>;
};

export type MlbPickGameReviewInput = {
  pickId: number;
  pickDate?: string | null;
  gameLabel?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  gameStartTime?: string | null;
  side?: string | null;
  lineTaken?: number | null;
  marketType?: string | null;
  resultStatus?: string | null;
  gamePk?: number | null;
  liveFeed?: MlbLiveFeedForReview | null;
};

type MlbScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    home?: { team?: { name?: string } };
    away?: { team?: { name?: string } };
  };
};

type MlbScheduleResponse = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

type MlbLineScoreInning = {
  num?: number;
  home?: { runs?: number };
  away?: { runs?: number };
};

type MlbPlayForReview = {
  about?: {
    inning?: number;
    halfInning?: string;
    isScoringPlay?: boolean;
  };
  result?: {
    description?: string;
    event?: string;
    homeScore?: number;
    awayScore?: number;
  };
};

type MlbLiveFeedForReview = {
  gameData?: {
    status?: unknown;
    teams?: {
      home?: { name?: string };
      away?: { name?: string };
    };
  };
  liveData?: {
    linescore?: {
      currentInning?: number;
      innings?: MlbLineScoreInning[];
      teams?: {
        home?: { runs?: number };
        away?: { runs?: number };
      };
    };
    plays?: {
      allPlays?: MlbPlayForReview[];
    };
  };
};

type InningState = {
  inning: number;
  homeScore: number;
  awayScore: number;
  totalRuns: number;
  coverValue: number | null;
  selectedLead: number | null;
};

const REVIEW_CACHE_PREFIX = "mlb_pick_game_review_v3";

function getReviewCacheKey(pickId: number) {
  return `${REVIEW_CACHE_PREFIX}_${pickId}`;
}

function normalizeTeamName(name: string | null | undefined) {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSelectedTeam(params: MlbPickGameReviewInput) {
  const side = normalizeTeamName(params.side);
  const homeTeam = normalizeTeamName(params.homeTeam);
  const awayTeam = normalizeTeamName(params.awayTeam);

  if (!side || side.startsWith("over") || side.startsWith("under")) return null;
  if (homeTeam && side.includes(homeTeam)) return params.homeTeam ?? null;
  if (awayTeam && side.includes(awayTeam)) return params.awayTeam ?? null;

  return null;
}

function getSelectedTeamRole(
  selectedTeam: string | null,
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined
) {
  const selected = normalizeTeamName(selectedTeam);
  if (!selected) return null;
  if (selected === normalizeTeamName(homeTeam)) return "home" as const;
  if (selected === normalizeTeamName(awayTeam)) return "away" as const;
  return null;
}

function isTeamSideMarket(marketType: string | null | undefined) {
  return ["moneyline", "spread", "f5_moneyline", "f5_spread"].includes(marketType ?? "");
}

function isTotalMarket(marketType: string | null | undefined) {
  return ["total", "f5_total"].includes(marketType ?? "");
}

function getTotalDirection(side: string | null | undefined) {
  const normalized = (side ?? "").trim().toLowerCase();
  if (normalized.startsWith("over")) return "over" as const;
  if (normalized.startsWith("under")) return "under" as const;
  return null;
}

function formatTotalSubject(side: string | null | undefined, lineTaken: number | null | undefined) {
  const direction = getTotalDirection(side);
  if (!direction) return "The total";

  const label = direction === "under" ? "Under" : "Over";
  return `${label} ${lineTaken ?? ""}`.trim();
}

function getCoverValue(params: {
  marketType: string | null | undefined;
  selectedRole: "home" | "away" | null;
  homeScore: number;
  awayScore: number;
  lineTaken: number | null | undefined;
  side?: string | null | undefined;
}) {
  if (isTotalMarket(params.marketType)) {
    const direction = getTotalDirection(params.side);
    const line = Number(params.lineTaken ?? NaN);
    if (!direction || !Number.isFinite(line)) return null;

    const totalRuns = params.homeScore + params.awayScore;
    return direction === "under" ? line - totalRuns : totalRuns - line;
  }

  if (!params.selectedRole || !isTeamSideMarket(params.marketType)) return null;

  const selectedScore = params.selectedRole === "home" ? params.homeScore : params.awayScore;
  const opponentScore = params.selectedRole === "home" ? params.awayScore : params.homeScore;
  const margin = selectedScore - opponentScore;

  if (params.marketType === "spread" || params.marketType === "f5_spread") {
    return margin + Number(params.lineTaken ?? 0);
  }

  return margin;
}

function getSelectedLead(params: {
  selectedRole: "home" | "away" | null;
  homeScore: number;
  awayScore: number;
}) {
  if (!params.selectedRole) return null;
  return params.selectedRole === "home"
    ? params.homeScore - params.awayScore
    : params.awayScore - params.homeScore;
}

function getStatusFromCoverValue(value: number | null): MlbPickGameReview["keyPlays"][number]["status"] {
  if (value === null) return "unknown";
  if (value > 0) return "covering";
  if (value < 0) return "not_covering";
  return "pushing";
}

function buildInningStates(
  feed: MlbLiveFeedForReview | null | undefined,
  params: Pick<MlbPickGameReviewInput, "marketType" | "lineTaken" | "side"> & {
    selectedRole: "home" | "away" | null;
  }
) {
  let homeScore = 0;
  let awayScore = 0;

  return (feed?.liveData?.linescore?.innings ?? []).map((inning, index): InningState => {
    homeScore += Number(inning.home?.runs ?? 0);
    awayScore += Number(inning.away?.runs ?? 0);
    const inningNumber = Number(inning.num ?? index + 1);

    return {
      inning: Number.isFinite(inningNumber) ? inningNumber : index + 1,
      homeScore,
      awayScore,
      totalRuns: homeScore + awayScore,
      coverValue: getCoverValue({
        marketType: params.marketType,
        selectedRole: params.selectedRole,
        homeScore,
        awayScore,
        lineTaken: params.lineTaken,
        side: params.side,
      }),
      selectedLead: getSelectedLead({
        selectedRole: params.selectedRole,
        homeScore,
        awayScore,
      }),
    };
  });
}

function getFinalScores(feed: MlbLiveFeedForReview | null | undefined) {
  const homeScore = toNumber(feed?.liveData?.linescore?.teams?.home?.runs);
  const awayScore = toNumber(feed?.liveData?.linescore?.teams?.away?.runs);
  if (homeScore === null || awayScore === null) return { homeScore: null, awayScore: null };
  return { homeScore, awayScore };
}

function getFinalInnings(feed: MlbLiveFeedForReview | null | undefined) {
  const innings = feed?.liveData?.linescore?.innings?.length;
  if (typeof innings === "number" && innings > 0) return innings;

  const currentInning = toNumber(feed?.liveData?.linescore?.currentInning);
  return currentInning && currentInning > 0 ? currentInning : null;
}

function findInning(states: InningState[], inning: number) {
  return states.find((state) => state.inning === inning) ?? null;
}

function buildKeyPlays(
  feed: MlbLiveFeedForReview | null | undefined,
  params: Pick<MlbPickGameReviewInput, "marketType" | "lineTaken" | "side"> & {
    selectedRole: "home" | "away" | null;
  }
) {
  const scoringPlays = (feed?.liveData?.plays?.allPlays ?? []).filter(
    (play) => play.about?.isScoringPlay
  );
  const selected: MlbPickGameReview["keyPlays"] = [];
  let previousStatus: MlbPickGameReview["keyPlays"][number]["status"] | null = null;

  for (const play of scoringPlays) {
    const homeScore = toNumber(play.result?.homeScore);
    const awayScore = toNumber(play.result?.awayScore);
    const coverValue =
      homeScore === null || awayScore === null
        ? null
        : getCoverValue({
            marketType: params.marketType,
            selectedRole: params.selectedRole,
            homeScore,
            awayScore,
            lineTaken: params.lineTaken,
            side: params.side,
          });
    const status = getStatusFromCoverValue(coverValue);
    const inning = toNumber(play.about?.inning);
    const statusChanged = previousStatus !== null && status !== previousStatus;
    const latePlay = inning !== null && inning >= 7;

    if (statusChanged || latePlay) {
      selected.push({
        inning,
        halfInning: play.about?.halfInning ?? null,
        description: play.result?.description ?? play.result?.event ?? "Scoring play",
        homeScore,
        awayScore,
        coverValue,
        status,
      });
    }

    previousStatus = status;
  }

  return selected.slice(-6);
}

function buildUnknownReview(params: MlbPickGameReviewInput, reason: string): MlbPickGameReview {
  return {
    pickId: params.pickId,
    generatedAt: new Date().toISOString(),
    gamePk: params.gamePk ?? null,
    sourceUrl: params.gamePk
      ? `https://statsapi.mlb.com/api/v1.1/game/${params.gamePk}/feed/live`
      : null,
    pickDate: params.pickDate ?? null,
    gameLabel: params.gameLabel ?? null,
    marketType: params.marketType ?? null,
    selectedTeam: null,
    selectedTeamRole: null,
    finalHomeScore: null,
    finalAwayScore: null,
    finalInnings: null,
    lineTaken: params.lineTaken ?? null,
    verdict: "unknown",
    verdictLabel: "Game flow unavailable",
    shouldSoftenLearning: false,
    learningWeightMultiplier: 1,
    summary: reason,
    reasons: [reason],
    flow: {
      gradedInnings: 0,
      coveredAfterInnings: 0,
      ledAfterInnings: 0,
      tiedAfterInnings: 0,
      coverRate: 0,
      leadRate: 0,
      coveredAfterFive: null,
      coveredAfterSeven: null,
      coveredAfterEight: null,
      ledAfterFive: null,
      ledAfterSeven: null,
      ledAfterEight: null,
      firstLostCoverInning: null,
      lastCoveredInning: null,
      finalCoverValue: null,
      failedByRuns: null,
      totalRunsAfterFive: null,
      lateRunsAfterFive: null,
      lateCoverLoss: false,
      extraInnings: false,
    },
    keyPlays: [],
  };
}

export function buildMlbPickGameReview(params: MlbPickGameReviewInput): MlbPickGameReview {
  const selectedTeam = getSelectedTeam(params);
  const selectedTeamRole = getSelectedTeamRole(selectedTeam, params.homeTeam, params.awayTeam);
  const marketType = params.marketType ?? null;
  const teamSideMarket = isTeamSideMarket(marketType);
  const totalMarket = isTotalMarket(marketType);
  const totalDirection = getTotalDirection(params.side);
  const subject = totalMarket
    ? formatTotalSubject(params.side, params.lineTaken)
    : selectedTeam ?? "This pick";
  const { homeScore: finalHomeScore, awayScore: finalAwayScore } = getFinalScores(params.liveFeed);
  const finalInnings = getFinalInnings(params.liveFeed);
  const sourceUrl = params.gamePk
    ? `https://statsapi.mlb.com/api/v1.1/game/${params.gamePk}/feed/live`
    : null;

  if (!teamSideMarket && !totalMarket) {
    return {
      ...buildUnknownReview(params, "Game flow review is currently available for MLB team side and total picks."),
      selectedTeam,
      selectedTeamRole,
      finalHomeScore,
      finalAwayScore,
      finalInnings,
      sourceUrl,
    };
  }

  if (teamSideMarket && (!selectedTeam || !selectedTeamRole)) {
    return {
      ...buildUnknownReview(params, "Could not identify the selected MLB team for this pick."),
      selectedTeam,
      selectedTeamRole,
      finalHomeScore,
      finalAwayScore,
      finalInnings,
      sourceUrl,
    };
  }

  if (totalMarket && !totalDirection) {
    return {
      ...buildUnknownReview(params, "Could not identify whether this total pick was over or under."),
      selectedTeam,
      selectedTeamRole,
      finalHomeScore,
      finalAwayScore,
      finalInnings,
      sourceUrl,
    };
  }

  const states = buildInningStates(params.liveFeed, {
    marketType,
    lineTaken: params.lineTaken,
    side: params.side,
    selectedRole: selectedTeamRole,
  });
  const inningLimit = marketType?.startsWith("f5_") ? 5 : states.length;
  const gradedStates = states.filter((state) => state.inning <= inningLimit);
  const gradedInnings = gradedStates.length;

  if (gradedInnings === 0 || finalHomeScore === null || finalAwayScore === null) {
    return {
      ...buildUnknownReview(params, "MLB game flow was unavailable from the live feed."),
      selectedTeam,
      selectedTeamRole,
      finalHomeScore,
      finalAwayScore,
      finalInnings,
      sourceUrl,
    };
  }

  const coveredStates = gradedStates.filter((state) => (state.coverValue ?? 0) > 0);
  const ledStates = gradedStates.filter((state) => (state.selectedLead ?? 0) > 0);
  const tiedStates = gradedStates.filter((state) => state.selectedLead === 0);
  const afterFive = findInning(gradedStates, 5);
  const afterSeven = findInning(gradedStates, 7);
  const afterEight = findInning(gradedStates, 8);
  const firstLostCover = gradedStates.find((state) => (state.coverValue ?? 0) < 0) ?? null;
  const lastCovered = [...gradedStates].reverse().find((state) => (state.coverValue ?? 0) > 0) ?? null;
  const finalCoverValue = getCoverValue({
    marketType,
    selectedRole: selectedTeamRole,
    homeScore: marketType?.startsWith("f5_") ? gradedStates[gradedStates.length - 1].homeScore : finalHomeScore,
    awayScore: marketType?.startsWith("f5_") ? gradedStates[gradedStates.length - 1].awayScore : finalAwayScore,
    lineTaken: params.lineTaken,
    side: params.side,
  });
  const failedByRuns = finalCoverValue !== null && finalCoverValue < 0 ? Math.abs(finalCoverValue) : null;
  const totalRunsAfterFive = afterFive?.totalRuns ?? null;
  const finalTrackedState = gradedStates[gradedStates.length - 1] ?? null;
  const finalTrackedTotal = finalTrackedState?.totalRuns ?? finalHomeScore + finalAwayScore;
  const lateRunsAfterFive =
    totalRunsAfterFive === null ? null : Math.max(0, finalTrackedTotal - totalRunsAfterFive);
  const coverRate = Number((coveredStates.length / Math.max(gradedInnings, 1)).toFixed(3));
  const leadRate = Number((ledStates.length / Math.max(gradedInnings, 1)).toFixed(3));
  const extraInnings = Boolean(finalInnings && finalInnings > 9);
  const coveredAfterFive = afterFive ? (afterFive.coverValue ?? 0) > 0 : null;
  const coveredAfterSeven = afterSeven ? (afterSeven.coverValue ?? 0) > 0 : null;
  const coveredAfterEight = afterEight ? (afterEight.coverValue ?? 0) > 0 : null;
  const ledAfterFive = afterFive ? (afterFive.selectedLead ?? 0) > 0 : null;
  const ledAfterSeven = afterSeven ? (afterSeven.selectedLead ?? 0) > 0 : null;
  const ledAfterEight = afterEight ? (afterEight.selectedLead ?? 0) > 0 : null;
  const lateCoverLoss =
    params.resultStatus === "loss" &&
    finalCoverValue !== null &&
    finalCoverValue < 0 &&
    (totalMarket
      ? Boolean(
          coveredAfterFive &&
            (coveredAfterSeven ||
              coveredAfterEight ||
              (firstLostCover?.inning !== null &&
                firstLostCover?.inning !== undefined &&
                firstLostCover.inning >= 6) ||
              (totalDirection === "under" && lateRunsAfterFive !== null && lateRunsAfterFive >= 5))
        )
      : Boolean(
          coveredAfterEight ||
            coveredAfterSeven ||
            (firstLostCover?.inning !== null &&
              firstLostCover?.inning !== undefined &&
              firstLostCover.inning >= Math.max(7, inningLimit - 1))
        ));

  const reasons: string[] = [];
  if (coverRate >= 0.67) {
    reasons.push(`${subject} covered after ${coveredStates.length} of ${gradedInnings} completed innings.`);
  }
  if (totalMarket && coveredAfterFive && afterFive) {
    reasons.push(`${subject} was still covering after 5 innings at ${afterFive.totalRuns} total runs.`);
  }
  if (totalMarket && totalDirection === "under" && lateRunsAfterFive !== null && lateRunsAfterFive >= 5) {
    reasons.push(`The game added ${lateRunsAfterFive} runs after the 5th inning.`);
  }
  if (totalMarket && firstLostCover?.inning) {
    reasons.push(`${subject} first stopped covering in inning ${firstLostCover.inning}.`);
  }
  if (!totalMarket && coveredAfterEight) reasons.push(`${subject} were still covering after the 8th inning.`);
  if (!totalMarket && coveredAfterSeven && !coveredAfterEight) reasons.push(`${subject} were covering after the 7th inning.`);
  if (!totalMarket && ledAfterEight) reasons.push(`${subject} led after the 8th inning.`);
  if (!totalMarket && !ledAfterEight && ledAfterSeven) reasons.push(`${subject} led after the 7th inning.`);
  if (extraInnings) reasons.push("The game went to extra innings.");
  if (failedByRuns !== null && failedByRuns <= 1.1) {
    reasons.push(`The ticket missed by ${failedByRuns.toFixed(1)} run against the line.`);
  } else if (totalMarket && failedByRuns !== null) {
    reasons.push(`The total missed by ${failedByRuns.toFixed(1)} runs against the line.`);
  }

  let verdict: MlbPickGameReviewVerdict = "unknown";
  let verdictLabel = "Game flow reviewed";
  let shouldSoftenLearning = false;
  let learningWeightMultiplier = 1;

  if (params.resultStatus !== "loss") {
    verdict = "not_loss";
    verdictLabel = "Not a loss";
  } else if (
    lateCoverLoss &&
    (totalMarket
      ? Boolean(
          coveredAfterFive &&
            (coverRate >= 0.45 ||
              (totalDirection === "under" && lateRunsAfterFive !== null && lateRunsAfterFive >= 5) ||
              (failedByRuns !== null && failedByRuns <= 3.5))
        )
      : (coverRate >= 0.6 ||
          coveredAfterEight ||
          ledAfterEight ||
          extraInnings ||
          (failedByRuns !== null && failedByRuns <= 1.1)))
  ) {
    verdict = "fine_loss";
    verdictLabel = "Fine loss - soften learning";
    shouldSoftenLearning = true;
    learningWeightMultiplier = totalMarket ? 0.45 : extraInnings ? 0.2 : 0.3;
  } else if (coverRate <= 0.25 && (failedByRuns === null || failedByRuns >= 2.5)) {
    verdict = "bad_loss";
    verdictLabel = "Bad loss";
    reasons.push(`${subject} was not covering for most of the tracked game flow.`);
  } else {
    verdict = "normal_loss";
    verdictLabel = "Normal loss";
  }

  const summary =
    verdict === "fine_loss"
      ? totalMarket
        ? `${subject} had the right game-flow read early, then the ticket flipped after a late scoring surge. Keep the loss in the record, but soften the learning penalty.`
        : `${subject} had the right side of the game flow for most of the night, then the ticket flipped late. Keep the loss in the record, but soften the learning penalty.`
      : verdict === "bad_loss"
        ? `${subject} did not hold enough of the game flow, so this should count as a real miss for learning.`
        : verdict === "normal_loss"
          ? `${subject} had some positive game flow, but not enough to soften the learning penalty.`
          : verdict === "not_loss"
            ? "This pick was not graded as a loss, so no loss-quality adjustment is needed."
            : "Game flow was reviewed, but there was not enough signal to classify the loss quality.";

  return {
    pickId: params.pickId,
    generatedAt: new Date().toISOString(),
    gamePk: params.gamePk ?? null,
    sourceUrl,
    pickDate: params.pickDate ?? null,
    gameLabel: params.gameLabel ?? null,
    marketType,
    selectedTeam,
    selectedTeamRole,
    finalHomeScore,
    finalAwayScore,
    finalInnings,
    lineTaken: params.lineTaken ?? null,
    verdict,
    verdictLabel,
    shouldSoftenLearning,
    learningWeightMultiplier,
    summary,
    reasons,
    flow: {
      gradedInnings,
      coveredAfterInnings: coveredStates.length,
      ledAfterInnings: ledStates.length,
      tiedAfterInnings: tiedStates.length,
      coverRate,
      leadRate,
      coveredAfterFive,
      coveredAfterSeven,
      coveredAfterEight,
      ledAfterFive,
      ledAfterSeven,
      ledAfterEight,
      firstLostCoverInning: firstLostCover?.inning ?? null,
      lastCoveredInning: lastCovered?.inning ?? null,
      finalCoverValue,
      failedByRuns,
      totalRunsAfterFive,
      lateRunsAfterFive,
      lateCoverLoss,
      extraInnings,
    },
    keyPlays: buildKeyPlays(params.liveFeed, {
      marketType,
      lineTaken: params.lineTaken,
      side: params.side,
      selectedRole: selectedTeamRole,
    }),
  };
}

async function fetchMlbScheduledGameForReview(params: MlbPickGameReviewInput) {
  if (!params.homeTeam || !params.awayTeam) return null;

  const searchDates = new Set<string>();
  if (params.pickDate) searchDates.add(params.pickDate);
  if (params.gameStartTime) {
    const start = new Date(params.gameStartTime);
    if (!Number.isNaN(start.getTime())) {
      searchDates.add(start.toISOString().slice(0, 10));
      searchDates.add(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(start)
      );
    }
  }

  const matching: MlbScheduleGame[] = [];
  for (const date of searchDates) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, {
      cache: "no-store",
    });
    if (!res.ok) continue;
    const data = (await res.json()) as MlbScheduleResponse;
    const games = data.dates?.flatMap((entry) => entry.games ?? []) ?? [];
    matching.push(
      ...games.filter(
        (game) =>
          normalizeTeamName(game.teams?.home?.team?.name) === normalizeTeamName(params.homeTeam) &&
          normalizeTeamName(game.teams?.away?.team?.name) === normalizeTeamName(params.awayTeam)
      )
    );
  }

  if (matching.length === 0) return null;
  if (matching.length === 1 || !params.gameStartTime) return matching[0] ?? null;

  const pickStart = new Date(params.gameStartTime).getTime();
  return (
    matching
      .map((game) => ({
        game,
        diff: Math.abs(pickStart - new Date(game.gameDate ?? params.gameStartTime ?? 0).getTime()),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.game ?? null
  );
}

async function fetchMlbLiveFeedForReview(gamePk: number) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MLB live feed failed for game ${gamePk}: ${res.status}`);
  }

  return res.json() as Promise<MlbLiveFeedForReview>;
}

export async function cacheMlbPickGameReview(review: MlbPickGameReview) {
  await setCachedData(getReviewCacheKey(review.pickId), review);
}

export async function getCachedMlbPickGameReview(pickId: number | null | undefined) {
  if (!pickId) return null;
  const cached = await getCachedData(getReviewCacheKey(pickId));
  return (cached?.data as MlbPickGameReview | null) ?? null;
}

export async function analyzeMlbPickGameReview(params: MlbPickGameReviewInput) {
  const review = buildMlbPickGameReview(params);
  await cacheMlbPickGameReview(review);
  return review;
}

export async function getOrAnalyzeMlbPickGameReview(params: MlbPickGameReviewInput) {
  const cached = await getCachedMlbPickGameReview(params.pickId);
  if (cached) return cached;

  let gamePk = params.gamePk ?? null;
  if (!gamePk) {
    const scheduledGame = await fetchMlbScheduledGameForReview(params);
    gamePk = scheduledGame?.gamePk ?? null;
  }

  if (!gamePk) {
    const review = buildUnknownReview(params, "Could not match this pick to an MLB StatsAPI game.");
    await cacheMlbPickGameReview(review);
    return review;
  }

  const liveFeed = params.liveFeed ?? (await fetchMlbLiveFeedForReview(gamePk));
  return analyzeMlbPickGameReview({
    ...params,
    gamePk,
    liveFeed,
  });
}
