import { getMlbDoubleheaderGameLabels, isMlbDoubleheaderGameLabel } from "@/lib/mlbDoubleheader";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import type { MlbPropCandidate } from "@/lib/mlbPropModel";
import { getConfidenceStars } from "@/lib/starRatings";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export type SavedMlbPropBoardRow = {
  id?: number;
  external_event_id?: string | null;
  game_label?: string | null;
  player_name: string | null;
  market_type: string | null;
  side: string;
  line_taken?: number | null;
  line?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  projected_line?: number | null;
  market_line?: number | null;
  game_start_time?: string | null;
};

export function propBoardKey(row: {
  player_name: string | null;
  market_type: string | null;
  side: string;
  line_taken?: number | null;
  line?: number | null;
}) {
  return `${row.player_name}|${row.market_type}|${row.side}|${row.line_taken ?? row.line ?? "na"}`;
}

export function toSavedPropBoardCandidate(row: SavedMlbPropBoardRow) {
  return {
    external_event_id: row.external_event_id ?? "",
    commence_time: row.game_start_time ?? null,
    game_label: row.game_label ?? "",
    home_team: "",
    away_team: "",
    player_name: row.player_name ?? "",
    player_team: "",
    player_team_short: "",
    market_type: (row.market_type ?? "batter_hits") as MlbPropCandidate["market_type"],
    line: row.line_taken ?? null,
    side: row.side,
    odds_taken: row.odds_taken ?? null,
    confidence_score: Number(row.confidence_score ?? 0),
    edge: Number(row.edge ?? 0),
    edge_label: row.edge_label ?? "",
    stat_key: "",
    top_pick_score: Number(row.confidence_score ?? 0),
    notes: null,
    projected_line: row.projected_line ?? null,
    market_line: row.market_line ?? row.line_taken ?? null,
    bet_recommendation:
      Number(row.confidence_score ?? 0) >= 54 && Number(row.edge ?? 0) >= 0.7 ? "bet" : "lean",
  } satisfies MlbPropCandidate;
}

function getPropValueScore(candidate: MlbPropCandidate) {
  const odds = candidate.odds_taken ?? 0;
  const payoutBonus =
    odds >= 140 ? 18 : odds >= 110 ? 14 : odds >= 100 ? 12 : odds >= -110 ? 10 : odds >= -135 ? 7 : 4;

  return Number(((candidate.edge ?? 0) * 24 + candidate.confidence_score * 0.22 + payoutBonus).toFixed(1));
}

function getProfitPerUnit(american: number | null | undefined) {
  if (american === null || american === undefined) return 0;
  if (american > 0) return american / 100;
  return 100 / Math.abs(american);
}

function getPropBoardStars(candidate: MlbPropCandidate) {
  return getConfidenceStars({
    sport: "MLB",
    marketType: candidate.market_type,
    edge: candidate.edge,
    confidenceScore: candidate.confidence_score,
    gameStartTime: candidate.commence_time,
  });
}

function getPropWarningFlags(candidate: MlbPropCandidate) {
  const flags = new Set<string>((candidate.risk_flags ?? []).map((flag) => flag.toLowerCase()));
  const edgeLabel = (candidate.edge_label ?? "").toLowerCase();

  if (edgeLabel.includes("low payout")) flags.add("low payout");
  if (edgeLabel.includes("thin prop edge")) flags.add("thin prop edge");
  if (edgeLabel.includes("thin probability edge")) flags.add("thin probability edge");
  if (edgeLabel.includes("pa risk")) flags.add("pa risk");
  if (edgeLabel.includes("workload risk")) flags.add("workload risk");
  if (edgeLabel.includes("run-production volatility")) flags.add("run-production volatility");
  if (edgeLabel.includes("market health is cold")) flags.add("market health is cold");
  if (edgeLabel.includes("watch:") && flags.size === 0) flags.add("watch");

  return Array.from(flags);
}

function getPropDirection(candidate: MlbPropCandidate) {
  const normalized = String(candidate.side ?? "").trim().toLowerCase();
  if (normalized.startsWith("over")) return "over" as const;
  if (normalized.startsWith("under")) return "under" as const;
  return null;
}

function getAverageLineClearRate(candidate: MlbPropCandidate) {
  const rates = [candidate.recent_line_clear_rate, candidate.season_line_clear_rate]
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
    .map(Number);

  if (rates.length === 0) return null;
  return rates.reduce((sum, value) => sum + value, 0) / rates.length;
}

function normalizePlayerName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/ jr$/g, "")
    .replace(/ sr$/g, "")
    .replace(/ ii$/g, "")
    .replace(/ iii$/g, "")
    .replace(/ iv$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPlayerMarketCooldownPenalty(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  const direction = getPropDirection(candidate);
  if (!direction) return 0;

  const key = `${normalizePlayerName(candidate.player_name)}|${candidate.market_type}|${direction}`;
  const cooldown = learningProfile?.playerMarketCooldowns?.[key];
  if (!cooldown?.inCooldown) return 0;

  return cooldown.penalty ?? 0;
}

function getPlayerMarketCooldown(candidate: MlbPropCandidate, learningProfile: MlbLearningProfile | null) {
  const direction = getPropDirection(candidate);
  if (!direction) return null;

  const key = `${normalizePlayerName(candidate.player_name)}|${candidate.market_type}|${direction}`;
  return learningProfile?.playerMarketCooldowns?.[key] ?? null;
}

function isHardCooldownBlocked(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null,
  boardType: "top" | "value"
) {
  const cooldown = getPlayerMarketCooldown(candidate, learningProfile);
  if (!cooldown?.inCooldown) return false;

  if (cooldown.penalty >= 12) return true;
  if (boardType === "top" && cooldown.sampleSize >= 4) return true;

  return (
    getPropBoardStars(candidate) < 5 &&
    cooldown.recentSampleSize >= 3 &&
    cooldown.recentNetUnits <= -2.5
  );
}

function isBatterTotalBasesOver(candidate: MlbPropCandidate) {
  return candidate.market_type === "batter_total_bases" && getPropDirection(candidate) === "over";
}

function isPitcherWorkloadMarket(candidate: MlbPropCandidate) {
  return candidate.market_type === "pitcher_strikeouts" || candidate.market_type === "pitcher_outs";
}

function isBatterRunProductionMarket(candidate: MlbPropCandidate) {
  return (
    candidate.market_type === "batter_rbis" ||
    candidate.market_type === "batter_runs_scored" ||
    candidate.market_type === "batter_hits_runs_rbis"
  );
}

function meetsBasePropBoardThreshold(candidate: MlbPropCandidate) {
  if (getPropBoardStars(candidate) < 3) return false;
  if ((candidate.edge ?? 0) < 0.7) return false;
  if (candidate.confidence_score < 54) return false;
  if (candidate.odds_taken === null || candidate.odds_taken === undefined) return false;

  const payout = getProfitPerUnit(candidate.odds_taken);
  if (payout < 0.5) return false;

  return true;
}

function meetsBaseBestValueThreshold(candidate: MlbPropCandidate) {
  if (getPropBoardStars(candidate) < 3) return false;
  if ((candidate.edge ?? 0) < 0.8) return false;
  if (candidate.confidence_score < 56) return false;
  if (candidate.odds_taken === null || candidate.odds_taken === undefined) return false;

  const payout = getProfitPerUnit(candidate.odds_taken);
  if (payout < 0.55) return false;

  return true;
}

function isStrictPropBoardEligible(candidate: MlbPropCandidate) {
  return meetsBasePropBoardThreshold(candidate) && getPropWarningFlags(candidate).length === 0;
}

function isRelaxedPropBoardEligible(candidate: MlbPropCandidate) {
  if (!meetsBasePropBoardThreshold(candidate)) return false;

  return getPropWarningFlags(candidate).every(
    (flag) => flag === "market health is cold" || flag.startsWith("low payout")
  );
}

function isBestValueMarketCold(candidate: MlbPropCandidate, learningProfile: MlbLearningProfile | null) {
  const marketHealth = learningProfile?.propMarketHealth?.[candidate.market_type];
  if (!marketHealth) return false;

  return (
    marketHealth.bestValueSampleSize >= 8 &&
    (marketHealth.bestValueWinRate < 46 || marketHealth.bestValueNetUnits < -2)
  );
}

function getProjectedPitchCount(candidate: MlbPropCandidate) {
  if (
    candidate.projected_pitch_count !== null &&
    candidate.projected_pitch_count !== undefined &&
    Number.isFinite(candidate.projected_pitch_count)
  ) {
    return Number(candidate.projected_pitch_count);
  }

  const match = (candidate.edge_label ?? "").match(/\/\s*(\d+(?:\.\d+)?)\s+pitches/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBestValuePropMarketEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  if (isHardCooldownBlocked(candidate, learningProfile, "value")) {
    return false;
  }

  const stars = getPropBoardStars(candidate);
  const payout = getProfitPerUnit(candidate.odds_taken);
  const direction = getPropDirection(candidate);
  const marketHealth = learningProfile?.propMarketHealth?.[candidate.market_type];

  if (
    isBestValueMarketCold(candidate, learningProfile) &&
    !(
      stars >= 4 &&
      candidate.confidence_score >= 62 &&
      (candidate.edge ?? 0) >= 0.95 &&
      payout >= 0.6
    )
  ) {
    return false;
  }

  if (isPitcherWorkloadMarket(candidate)) {
    const projectedInnings = getProjectedPitcherInnings(candidate);
    const projectedPitchCount = getProjectedPitchCount(candidate);
    const lowWorkloadDirectionHealth =
      direction && marketHealth?.lowWorkloadDirectionHealth
        ? marketHealth.lowWorkloadDirectionHealth[direction]
        : null;

    if (direction === "over") {
      const shortLeashProfile =
        (projectedInnings !== null && projectedInnings < 5.2) ||
        (projectedPitchCount !== null && projectedPitchCount < 84) ||
        ((candidate.recent_workload_swing ?? 0) <= -5);

      if (lowWorkloadDirectionHealth && !lowWorkloadDirectionHealth.inRotation) {
        return false;
      }

      if (
        shortLeashProfile &&
        !(
          stars >= 5 &&
          candidate.confidence_score >= 68 &&
          (candidate.edge ?? 0) >= 1.15 &&
          payout >= 0.65
        )
      ) {
        return false;
      }
    }
  }

  if (candidate.market_type === "batter_total_bases" && direction === "over") {
    const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
    const averageClearRate = getAverageLineClearRate(candidate);
    const spikeGameShare =
      candidate.spike_game_share !== null && candidate.spike_game_share !== undefined
        ? Number(candidate.spike_game_share)
        : null;
    const expectedPlateAppearances = getExpectedPlateAppearances(candidate);
    const shakyTbProfile =
      (clearProbability !== null && clearProbability < 0.52) ||
      (averageClearRate !== null && averageClearRate < 0.46) ||
      (spikeGameShare !== null && spikeGameShare > 0.36) ||
      (expectedPlateAppearances !== null && expectedPlateAppearances < 4);

    if (shakyTbProfile) {
      return (
        stars >= 4 &&
        candidate.confidence_score >= 68 &&
        (candidate.edge ?? 0) >= 1.15 &&
        payout >= 0.68 &&
        (clearProbability === null || clearProbability >= 0.54) &&
        (averageClearRate === null || averageClearRate >= 0.48) &&
        (spikeGameShare === null || spikeGameShare <= 0.34) &&
        (expectedPlateAppearances === null || expectedPlateAppearances >= 4.05)
      );
    }
  }

  return true;
}

function isStrictBestValuePropBoardEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  return (
    meetsBaseBestValueThreshold(candidate) &&
    getPropWarningFlags(candidate).length === 0 &&
    isBestValuePropMarketEligible(candidate, learningProfile)
  );
}

function isRelaxedBestValuePropBoardEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  if (!meetsBaseBestValueThreshold(candidate)) return false;
  if (!isBestValuePropMarketEligible(candidate, learningProfile)) return false;

  return getPropWarningFlags(candidate).every(
    (flag) => flag === "market health is cold" || flag.startsWith("low payout")
  );
}

function isTopPickPropMarketEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  if (isHardCooldownBlocked(candidate, learningProfile, "top")) {
    return false;
  }

  const marketHealth = learningProfile?.propMarketHealth?.[candidate.market_type];
  const direction = getPropDirection(candidate);
  const directionHealth =
    direction && marketHealth?.directionalTopPickHealth
      ? marketHealth.directionalTopPickHealth[direction]
      : null;

  if (!marketHealth) return true;
  if (directionHealth && !directionHealth.inRotation) return false;

  const overallMarketIsCold =
    marketHealth.topPickSampleSize >= 8 &&
    (marketHealth.topPickWinRate < 48 || marketHealth.topPickNetUnits < -1);
  const bestValueIsClearlyHealthier =
    marketHealth.bestValueSampleSize >= 8 &&
    marketHealth.bestValueWinRate >= 56 &&
    marketHealth.bestValueNetUnits > 0;
  const directionActualTopPicksAreShaky =
    Boolean(directionHealth) &&
    (directionHealth?.actualTopPickSampleSize ?? 0) >= 6 &&
    (directionHealth?.actualTopPickWinRate ?? 0) < 48 &&
    (directionHealth?.actualTopPickNetUnits ?? 0) < 0;

  if (!(overallMarketIsCold && bestValueIsClearlyHealthier) && !directionActualTopPicksAreShaky) {
    if (isPitcherWorkloadMarket(candidate) && direction === "over") {
      const projectedInnings = getProjectedPitcherInnings(candidate);
      const projectedPitchCount = getProjectedPitchCount(candidate);
      const shortLeashProfile =
        (projectedInnings !== null && projectedInnings < 5.3) ||
        (projectedPitchCount !== null && projectedPitchCount < 84) ||
        ((candidate.recent_workload_swing ?? 0) <= -5);

      if (
        shortLeashProfile &&
        !(
          getPropBoardStars(candidate) >= 4 &&
          candidate.confidence_score >= 70 &&
          (candidate.edge ?? 0) >= 1.15 &&
          getProfitPerUnit(candidate.odds_taken) >= 0.62
        )
      ) {
        return false;
      }
    }

    if (isBatterTotalBasesOver(candidate)) {
      const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
      const averageClearRate = getAverageLineClearRate(candidate);
      const expectedPlateAppearances = getExpectedPlateAppearances(candidate);
      const spikeGameShare =
        candidate.spike_game_share !== null && candidate.spike_game_share !== undefined
          ? Number(candidate.spike_game_share)
          : null;

      if (
        (clearProbability !== null && clearProbability < 0.54) ||
        (averageClearRate !== null && averageClearRate < 0.48) ||
        (spikeGameShare !== null && spikeGameShare > 0.34) ||
        (expectedPlateAppearances !== null && expectedPlateAppearances < 4)
      ) {
        return false;
      }
    }

    return true;
  }

  return (
    getPropBoardStars(candidate) >= 4 &&
    candidate.confidence_score >= 68 &&
    (candidate.edge ?? 0) >= 1 &&
    getProfitPerUnit(candidate.odds_taken) >= 0.6
  );
}

function isStrictTopPickPropBoardEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  return isStrictPropBoardEligible(candidate) && isTopPickPropMarketEligible(candidate, learningProfile);
}

function isRelaxedTopPickPropBoardEligible(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  return isRelaxedPropBoardEligible(candidate) && isTopPickPropMarketEligible(candidate, learningProfile);
}

function getProjectedPitcherInnings(candidate: MlbPropCandidate) {
  if (
    candidate.projected_innings !== null &&
    candidate.projected_innings !== undefined &&
    Number.isFinite(candidate.projected_innings)
  ) {
    return Number(candidate.projected_innings);
  }

  const match = (candidate.edge_label ?? "").match(/proj\s+(\d+(?:\.\d+)?)\s+IP/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getExpectedPlateAppearances(candidate: MlbPropCandidate) {
  if (
    candidate.expected_plate_appearances !== null &&
    candidate.expected_plate_appearances !== undefined &&
    Number.isFinite(candidate.expected_plate_appearances)
  ) {
    return Number(candidate.expected_plate_appearances);
  }

  const match = (candidate.edge_label ?? "").match(/proj\s+(\d+(?:\.\d+)?)\s+PA/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPropStabilityPreference(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  const direction = getPropDirection(candidate);
  const payout = getProfitPerUnit(candidate.odds_taken);
  const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
  const averageClearRate = getAverageLineClearRate(candidate);
  const expectedPlateAppearances = getExpectedPlateAppearances(candidate);
  const projectedInnings = getProjectedPitcherInnings(candidate);
  const projectedPitchCount = getProjectedPitchCount(candidate);
  const spikeGameShare =
    candidate.spike_game_share !== null && candidate.spike_game_share !== undefined
      ? Number(candidate.spike_game_share)
      : null;

  let stability = 0;

  if (direction === "under") {
    stability += 1.4;
  }

  if (candidate.market_type === "batter_hits" && direction === "over") {
    if (averageClearRate !== null) stability += clamp((averageClearRate - 0.52) * 8, -1.2, 1.8);
    if (clearProbability !== null) stability += clamp((clearProbability - 0.55) * 8, -1.2, 1.8);
    if (expectedPlateAppearances !== null && expectedPlateAppearances < 4) stability -= 0.8;
  }

  if (candidate.market_type === "batter_total_bases" && direction === "over") {
    stability -= 2;
    if (averageClearRate !== null) stability += clamp((averageClearRate - 0.49) * 8, -1.8, 1.2);
    if (clearProbability !== null) stability += clamp((clearProbability - 0.53) * 10, -2.2, 1.4);
    if (spikeGameShare !== null && spikeGameShare > 0.32) {
      stability -= clamp((spikeGameShare - 0.32) * 18, 0, 3);
    }
    if (expectedPlateAppearances !== null && expectedPlateAppearances < 4) stability -= 1.2;
  }

  if (isBatterRunProductionMarket(candidate) && direction === "over") {
    stability -= 1.4;
    if (averageClearRate !== null) stability += clamp((averageClearRate - 0.46) * 8, -1.6, 1.2);
    if (clearProbability !== null) stability += clamp((clearProbability - 0.5) * 10, -2, 1.4);
    if (expectedPlateAppearances !== null && expectedPlateAppearances < 4.1) stability -= 1.1;
    if (spikeGameShare !== null && spikeGameShare > 0.38) {
      stability -= clamp((spikeGameShare - 0.38) * 16, 0, 2.5);
    }
  }

  if (isPitcherWorkloadMarket(candidate) && direction === "over") {
    if (projectedInnings !== null && projectedInnings < 5.3) stability -= 1.8;
    if (projectedPitchCount !== null && projectedPitchCount < 84) stability -= 1.4;
    if ((candidate.recent_workload_swing ?? 0) <= -5) stability -= 1.2;
  }

  if (payout > 1.15) stability -= 0.6;
  if (payout <= 0.8) stability += 0.3;

  stability -= getPlayerMarketCooldownPenalty(candidate, learningProfile) * 0.12;

  return Number(stability.toFixed(2));
}

function getPropTopPickLearningAdjustment(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  const topPickPreferences = learningProfile?.topPickPreferences;
  const starRatingPreferences = learningProfile?.starRatingPreferences;
  const lossReviewAdjustments = learningProfile?.lossReviewAdjustments;
  let adjustment = 0;

  if (topPickPreferences) {
    if (candidate.market_type === "pitcher_strikeouts") {
      adjustment += topPickPreferences.pitcherStrikeouts;
    } else if (candidate.market_type === "pitcher_outs") {
      adjustment += topPickPreferences.pitcherOuts;
    } else if (candidate.market_type === "batter_hits") {
      adjustment += topPickPreferences.batterHits;
    } else if (candidate.market_type === "batter_total_bases") {
      adjustment += topPickPreferences.batterTotalBases;
    } else if (candidate.market_type === "batter_rbis") {
      adjustment += topPickPreferences.batterRbis;
    } else if (candidate.market_type === "batter_runs_scored") {
      adjustment += topPickPreferences.batterRunsScored;
    } else if (candidate.market_type === "batter_hits_runs_rbis") {
      adjustment += topPickPreferences.batterHitsRunsRbis;
    }
  }

  if (starRatingPreferences) {
    if (candidate.confidence_score >= 100) {
      adjustment += starRatingPreferences.fiveStar;
    } else if (candidate.confidence_score >= 80) {
      adjustment += starRatingPreferences.fourStar;
    }
  }

  if (lossReviewAdjustments) {
    const pickSide = String(candidate.side ?? "").toLowerCase();

    if (candidate.market_type === "pitcher_strikeouts") {
      adjustment -= lossReviewAdjustments.pitcherStrikeoutTopPickPenalty;
    } else if (candidate.market_type === "pitcher_outs") {
      adjustment -= lossReviewAdjustments.pitcherOutsTopPickPenalty;
    }

    if (isPitcherWorkloadMarket(candidate)) {
      const projectedInnings = getProjectedPitcherInnings(candidate);
      if (pickSide.startsWith("over") && projectedInnings !== null && projectedInnings < 5.2) {
        adjustment -= lossReviewAdjustments.pitcherStrikeoutLowIpPenalty;
      }
    }

    if (isBatterRunProductionMarket(candidate)) {
      adjustment -= lossReviewAdjustments.batterRunProductionTopPickPenalty;
    }

    if (
      !isPitcherWorkloadMarket(candidate) &&
      pickSide.startsWith("over")
    ) {
      const expectedPlateAppearances = getExpectedPlateAppearances(candidate);
      if (expectedPlateAppearances !== null && expectedPlateAppearances < 4) {
        adjustment -= lossReviewAdjustments.batterLowPaOverPenalty;
      }
    }
  }

  adjustment -= getPlayerMarketCooldownPenalty(candidate, learningProfile);

  return adjustment;
}

function getPropBestValueLearningAdjustment(
  candidate: MlbPropCandidate,
  learningProfile: MlbLearningProfile | null
) {
  const direction = getPropDirection(candidate);
  const marketHealth = learningProfile?.propMarketHealth?.[candidate.market_type];
  const lossReviewAdjustments = learningProfile?.lossReviewAdjustments;
  let adjustment = 0;

  if (isPitcherWorkloadMarket(candidate)) {
    if (marketHealth?.bestValueSampleSize && marketHealth.bestValueSampleSize >= 10) {
      if (marketHealth.bestValueWinRate < 48 || marketHealth.bestValueNetUnits < -2) {
        adjustment -= 4;
      }
    }

    if (direction === "over") {
      const projectedInnings = getProjectedPitcherInnings(candidate);
      const projectedPitchCount = getProjectedPitchCount(candidate);

      if (projectedInnings !== null && projectedInnings < 5.2) {
        adjustment -= lossReviewAdjustments
          ? Number((lossReviewAdjustments.pitcherStrikeoutLowIpPenalty * 0.75).toFixed(1))
          : 2.2;
      }

      if (projectedPitchCount !== null && projectedPitchCount < 82) {
        adjustment -= 1.8;
      }

      if ((candidate.recent_workload_swing ?? 0) <= -6) {
        adjustment -= lossReviewAdjustments
          ? Number((lossReviewAdjustments.pitcherStrikeoutWorkloadDipPenalty * 0.65).toFixed(1))
          : 1.8;
      }
    }
  }

  if (candidate.market_type === "batter_total_bases" && direction === "over") {
    const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
    const averageClearRate = getAverageLineClearRate(candidate);
    const spikeGameShare =
      candidate.spike_game_share !== null && candidate.spike_game_share !== undefined
        ? Number(candidate.spike_game_share)
        : null;
    const expectedPlateAppearances = getExpectedPlateAppearances(candidate);

    if (averageClearRate !== null) {
      adjustment += clamp((averageClearRate - 0.5) * 10, -3, 2.5);
    }

    if (clearProbability !== null) {
      adjustment += clamp((clearProbability - 0.52) * 12, -3, 2.5);
    }

    if (spikeGameShare !== null && spikeGameShare > 0.34) {
      adjustment -= clamp((spikeGameShare - 0.34) * 20, 0, 4.5);
    }

    if (expectedPlateAppearances !== null && expectedPlateAppearances < 4) {
      adjustment -= 1.5;
    }
  }

  if (candidate.market_type === "batter_hits" && direction === "over") {
    const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
    const averageClearRate = getAverageLineClearRate(candidate);

    if (averageClearRate !== null) {
      adjustment += clamp((averageClearRate - 0.52) * 10, -1.5, 2.5);
    }

    if (clearProbability !== null) {
      adjustment += clamp((clearProbability - 0.55) * 12, -1.5, 2.5);
    }
  }

  if (isBatterRunProductionMarket(candidate) && direction === "over") {
    const clearProbability = candidate.line_clear_probability ?? candidate.true_probability ?? null;
    const averageClearRate = getAverageLineClearRate(candidate);
    const expectedPlateAppearances = getExpectedPlateAppearances(candidate);

    adjustment -= 1;

    if (averageClearRate !== null) {
      adjustment += clamp((averageClearRate - 0.46) * 9, -2.5, 2);
    }

    if (clearProbability !== null) {
      adjustment += clamp((clearProbability - 0.5) * 11, -2.5, 2);
    }

    if (expectedPlateAppearances !== null && expectedPlateAppearances < 4.1) {
      adjustment -= 1.4;
    }
  }

  return Number(adjustment.toFixed(1));
}

function rankTopPropCandidates(
  candidates: MlbPropCandidate[],
  learningProfile: MlbLearningProfile | null
) {
  return [...candidates].sort((a, b) => {
    const aScore = a.top_pick_score + getPropTopPickLearningAdjustment(a, learningProfile);
    const bScore = b.top_pick_score + getPropTopPickLearningAdjustment(b, learningProfile);

    if (bScore !== aScore) {
      const scoreDelta = bScore - aScore;
      if (Math.abs(scoreDelta) <= 2.5) {
        const stabilityDelta =
          getPropStabilityPreference(b, learningProfile) - getPropStabilityPreference(a, learningProfile);
        if (stabilityDelta !== 0) return stabilityDelta;
      }
      return scoreDelta;
    }
    if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
    return (b.edge ?? 0) - (a.edge ?? 0);
  });
}

function rankBestValuePropCandidates(
  candidates: MlbPropCandidate[],
  learningProfile: MlbLearningProfile | null
) {
  return [...candidates].sort((a, b) => {
    const aScore = getPropValueScore(a) + getPropBestValueLearningAdjustment(a, learningProfile);
    const bScore = getPropValueScore(b) + getPropBestValueLearningAdjustment(b, learningProfile);
    const aPenalty = getPlayerMarketCooldownPenalty(a, learningProfile);
    const bPenalty = getPlayerMarketCooldownPenalty(b, learningProfile);
    const adjustedScoreDelta = (bScore - bPenalty) - (aScore - aPenalty);
    if (adjustedScoreDelta !== 0) {
      if (Math.abs(adjustedScoreDelta) <= 2.5) {
        const stabilityDelta =
          getPropStabilityPreference(b, learningProfile) - getPropStabilityPreference(a, learningProfile);
        if (stabilityDelta !== 0) return stabilityDelta;
      }
      return adjustedScoreDelta;
    }
    if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
    return (b.edge ?? 0) - (a.edge ?? 0);
  });
}

function selectGuardrailedPropCandidates(
  candidates: MlbPropCandidate[],
  limit: number,
  options?: {
    excludedKeys?: Set<string>;
    maxTbOvers?: number;
    maxRunProductionOvers?: number;
  }
) {
  const excludedKeys = options?.excludedKeys ?? new Set<string>();
  const maxTbOvers = options?.maxTbOvers ?? 1;
  const maxRunProductionOvers = options?.maxRunProductionOvers ?? 1;
  const selected: MlbPropCandidate[] = [];
  let tbOverCount = 0;
  let runProductionOverCount = 0;

  for (const candidate of candidates) {
    if (excludedKeys.has(propBoardKey(candidate))) continue;

    if (isBatterTotalBasesOver(candidate)) {
      if (tbOverCount >= maxTbOvers) continue;
      tbOverCount += 1;
    }

    if (isBatterRunProductionMarket(candidate) && getPropDirection(candidate) === "over") {
      if (runProductionOverCount >= maxRunProductionOvers) continue;
      runProductionOverCount += 1;
    }

    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  return selected;
}

function selectDistinctValuePropCandidates(
  candidates: MlbPropCandidate[],
  topCandidates: MlbPropCandidate[],
  limit: number,
  learningProfile: MlbLearningProfile | null
) {
  const topKeys = new Set(topCandidates.map((candidate) => propBoardKey(candidate)));
  return selectGuardrailedPropCandidates(rankBestValuePropCandidates(candidates, learningProfile), limit, {
    excludedKeys: topKeys,
    maxTbOvers: 1,
    maxRunProductionOvers: 1,
  });
}

function selectEligiblePropBoardPool(
  candidates: MlbPropCandidate[],
  strictFilter: (candidate: MlbPropCandidate) => boolean,
  relaxedFilter: (candidate: MlbPropCandidate) => boolean,
  minimumPoolSize: number
) {
  const strictCandidates = candidates.filter(strictFilter);
  const relaxedCandidates = candidates.filter(relaxedFilter);
  const boardCandidates =
    strictCandidates.length >= minimumPoolSize || relaxedCandidates.length === 0
      ? strictCandidates
      : relaxedCandidates;

  return {
    strictCandidates,
    relaxedCandidates,
    boardCandidates,
    usedRelaxedFallback:
      strictCandidates.length < minimumPoolSize && relaxedCandidates.length > 0,
  };
}

export function selectMlbPropBoardCandidates(
  candidates: MlbPropCandidate[],
  learningProfile: MlbLearningProfile | null,
  minimumPoolSize = 2,
  excludedGameLabels: Iterable<string> = []
) {
  const doubleheaderGameLabels = new Set([
    ...Array.from(getMlbDoubleheaderGameLabels(candidates)),
    ...Array.from(excludedGameLabels),
  ]);
  const boardEligibleCandidates = candidates.filter(
    (candidate) => !isMlbDoubleheaderGameLabel(candidate.game_label, doubleheaderGameLabels)
  );
  const topPool = selectEligiblePropBoardPool(
    boardEligibleCandidates,
    (candidate) => isStrictTopPickPropBoardEligible(candidate, learningProfile),
    (candidate) => isRelaxedTopPickPropBoardEligible(candidate, learningProfile),
    minimumPoolSize
  );
  const bestValuePool = selectEligiblePropBoardPool(
    boardEligibleCandidates,
    (candidate) => isStrictBestValuePropBoardEligible(candidate, learningProfile),
    (candidate) => isRelaxedBestValuePropBoardEligible(candidate, learningProfile),
    minimumPoolSize
  );

  const topCandidates = selectGuardrailedPropCandidates(
    rankTopPropCandidates(topPool.boardCandidates, learningProfile),
    3,
    { maxTbOvers: 1, maxRunProductionOvers: 1 }
  );
  const bestValueCandidates = selectDistinctValuePropCandidates(
    bestValuePool.boardCandidates,
    topCandidates,
    3,
    learningProfile
  );

  return {
    strictCandidates: bestValuePool.strictCandidates,
    relaxedCandidates: bestValuePool.relaxedCandidates,
    boardCandidates: bestValuePool.boardCandidates,
    topStrictCandidates: topPool.strictCandidates,
    topRelaxedCandidates: topPool.relaxedCandidates,
    topBoardCandidates: topPool.boardCandidates,
    topCandidates,
    bestValueCandidates,
    usedRelaxedFallback: topPool.usedRelaxedFallback || bestValuePool.usedRelaxedFallback,
    usedRelaxedTopFallback: topPool.usedRelaxedFallback,
    usedRelaxedBestValueFallback: bestValuePool.usedRelaxedFallback,
    excludedDoubleheaderGameLabels: Array.from(doubleheaderGameLabels),
  };
}
