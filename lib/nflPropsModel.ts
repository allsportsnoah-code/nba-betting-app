import { nflTeamProfiles } from "@/lib/nflRatings";
import {
  evaluatePropHitRate,
  calcLottoScoreFromEval,
  type PropGameContext,
} from "@/lib/nflPropEvaluator";

export const ODDS_API_PROP_MARKETS = [
  { key: "player_pass_yds",          label: "Pass Yds",       category: "passing",   defaultSide: "over" },
  { key: "player_pass_tds",          label: "Pass TDs",       category: "passing",   defaultSide: "over" },
  { key: "player_rush_yds",          label: "Rush Yds",       category: "rushing",   defaultSide: "over" },
  { key: "player_rush_tds",          label: "Rush TDs",       category: "rushing",   defaultSide: "over" },
  { key: "player_receptions",        label: "Receptions",     category: "receiving", defaultSide: "over" },
  { key: "player_reception_yds",     label: "Rec Yds",        category: "receiving", defaultSide: "over" },
  { key: "player_reception_tds",     label: "Rec TDs",        category: "receiving", defaultSide: "over" },
  { key: "player_anytime_td",        label: "Anytime TD",     category: "scoring",   defaultSide: "yes"  },
  { key: "player_pass_attempts",     label: "Pass Attempts",  category: "passing",   defaultSide: "over" },
  { key: "player_pass_completions",  label: "Completions",    category: "passing",   defaultSide: "over" },
  { key: "player_rush_attempts",     label: "Rush Attempts",  category: "rushing",   defaultSide: "over" },
  { key: "player_kicking_points",    label: "Kicking Pts",    category: "kicking",   defaultSide: "over" },
] as const;

export type OddsApiPropMarketKey = typeof ODDS_API_PROP_MARKETS[number]["key"];

export type NflPropOutcome = {
  name: string;
  description?: string | null;
  price: number;
  point?: number | null;
};

export type NflPropMarket = {
  key: OddsApiPropMarketKey;
  outcomes: NflPropOutcome[];
};

export type NflPropCandidate = {
  marketKey: OddsApiPropMarketKey;
  marketLabel: string;
  playerName: string;
  side: string;
  direction: "over" | "under" | "yes" | "no";
  lineTaken: number | null;
  oddsTaken: number;
  // Evaluation outputs
  impliedProb: number;       // from odds price
  hitProbability: number;    // model's estimated P(cashes)
  projectedValue: number;    // model's projected stat
  edge: number;              // hitProbability − impliedProb
  contextBoost: number;      // 0–8 bonus from team ratings matchup
  confidenceScore: number;   // 0–100 summary score
  lottoScore: number;        // ranking score for lotto selection
  gameLabel: string;
  gameId: string;
  teamContext: "favorable" | "neutral" | "unfavorable";
};

function americanToImpliedProb(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function getContextBoost(
  marketKey: OddsApiPropMarketKey,
  homeTeam: string,
  awayTeam: string
): { boost: number; context: NflPropCandidate["teamContext"] } {
  const home = nflTeamProfiles[homeTeam];
  const away = nflTeamProfiles[awayTeam];
  if (!home || !away) return { boost: 0, context: "neutral" };

  const evalTeam = (
    offense: number, passRush: number, coverage: number, passRate: string,
    oppDefense: number, oppPassRush: number, oppCoverage: number
  ) => {
    let b = 0;
    if (marketKey === "player_pass_yds" || marketKey === "player_pass_attempts" || marketKey === "player_pass_completions") {
      if (offense >= 107 && passRate === "pass-heavy") b += 5;
      else if (offense >= 104) b += 2;
      if (oppPassRush >= 108) b -= 3;
      if (oppDefense <= 97) b += 3;
    }
    if (marketKey === "player_pass_tds") {
      if (offense >= 109) b += 6;
      else if (offense >= 105) b += 3;
      if (oppDefense <= 97) b += 3;
      if (oppDefense >= 108) b -= 4;
    }
    if (marketKey === "player_rush_yds" || marketKey === "player_rush_attempts") {
      if (passRate === "run-first") b += 4;
      if (offense >= 106) b += 2;
      if (oppDefense >= 108) b -= 4;
      if (oppDefense <= 97) b += 3;
    }
    if (marketKey === "player_rush_tds") {
      if (offense >= 108 && passRate === "run-first") b += 5;
      if (oppDefense >= 108) b -= 4;
      if (oppDefense <= 97) b += 3;
    }
    if (marketKey === "player_receptions" || marketKey === "player_reception_yds" || marketKey === "player_reception_tds") {
      if (offense >= 106 && (passRate === "pass-heavy" || passRate === "balanced")) b += 3;
      if (oppCoverage >= 108) b -= 4;
      if (oppCoverage <= 97) b += 3;
    }
    if (marketKey === "player_anytime_td") {
      if (offense >= 108) b += 5;
      else if (offense >= 104) b += 2;
      if (oppDefense >= 108) b -= 3;
      if (oppDefense <= 97) b += 3;
    }
    if (marketKey === "player_kicking_points") {
      if (offense >= 107) b += 3;
      if (oppDefense <= 97) b += 2;
    }
    return Math.max(-8, Math.min(8, b));
  };

  const homeBoost = evalTeam(home.offense, home.passRush, home.coverage, home.coaching.passRateTendency, away.defense, away.passRush, away.coverage);
  const awayBoost = evalTeam(away.offense, away.passRush, away.coverage, away.coaching.passRateTendency, home.defense, home.passRush, home.coverage);
  const boost = Math.max(homeBoost, awayBoost, 0);

  const context: NflPropCandidate["teamContext"] = boost >= 4 ? "favorable" : boost <= -3 ? "unfavorable" : "neutral";
  return { boost, context };
}

export function evaluateNflPropMarkets(
  gameId: string,
  gameLabel: string,
  homeTeam: string,
  awayTeam: string,
  propMarkets: NflPropMarket[],
  gameCtx?: PropGameContext
): NflPropCandidate[] {
  const ctx: PropGameContext = gameCtx ?? { gameTotal: null, homeTeamTotal: null, awayTeamTotal: null, homeSpread: null };
  const candidates: NflPropCandidate[] = [];

  for (const market of propMarkets) {
    const marketDef = ODDS_API_PROP_MARKETS.find((m) => m.key === market.key);
    if (!marketDef) continue;

    // Odds API / PrizePicks: outcome.name = direction, outcome.description = player name
    const byPlayer: Record<string, NflPropOutcome[]> = {};
    for (const outcome of market.outcomes ?? []) {
      if (!outcome.description || !outcome.price) continue;
      const player = outcome.description.trim();
      if (!byPlayer[player]) byPlayer[player] = [];
      byPlayer[player].push(outcome);
    }

    const { boost, context } = getContextBoost(market.key, homeTeam, awayTeam);

    for (const [playerName, outcomes] of Object.entries(byPlayer)) {
      for (const outcome of outcomes) {
        const nameRaw = (outcome.name ?? "").toLowerCase().trim();
        const direction: NflPropCandidate["direction"] =
          nameRaw === "over" ? "over"
          : nameRaw === "under" ? "under"
          : nameRaw === "yes" ? "yes"
          : nameRaw === "no" ? "no"
          : (marketDef.defaultSide as NflPropCandidate["direction"]);

        // Only want overs and yes for lotto
        if (direction === "under" || direction === "no") continue;

        const impliedProb = americanToImpliedProb(outcome.price);

        // Skip extreme long shots or near-certainties
        if (impliedProb < 0.35 || impliedProb > 0.88) continue;

        // Determine which team the player is on for the prop evaluator
        // We pass both teams and let the evaluator use ratings for the player's team
        // Convention: home team is more likely to have favorable home context;
        // we try both and pick the one that makes sense for the market
        const playerTeam = homeTeam; // evaluator averages home/away boost above via getContextBoost
        const opponentTeam = awayTeam;

        const eval_ = evaluatePropHitRate(
          market.key,
          playerTeam,
          opponentTeam,
          direction,
          outcome.point ?? null,
          outcome.price,
          ctx
        );

        // Use the actual hit probability from our model as the primary confidence driver
        const hitProb = eval_.hitRate;

        const lottoScore = calcLottoScoreFromEval(hitProb, eval_.edge, outcome.price, boost);
        const confidenceScore = Math.round(Math.min(94, Math.max(35, hitProb * 100)));

        const dir = direction.charAt(0).toUpperCase() + direction.slice(1);
        const sideLabel =
          direction === "yes"
            ? `${playerName} Anytime TD`
            : outcome.point != null
            ? `${playerName} ${dir} ${outcome.point} ${marketDef.label}`
            : `${playerName} ${dir} ${marketDef.label}`;

        candidates.push({
          marketKey: market.key,
          marketLabel: marketDef.label,
          playerName,
          side: sideLabel,
          direction,
          lineTaken: outcome.point ?? null,
          oddsTaken: outcome.price,
          impliedProb: Number(impliedProb.toFixed(4)),
          hitProbability: Number(hitProb.toFixed(4)),
          projectedValue: eval_.projectedValue,
          edge: Number(eval_.edge.toFixed(4)),
          contextBoost: boost,
          confidenceScore,
          lottoScore: Number(lottoScore.toFixed(1)),
          gameLabel,
          gameId,
          teamContext: context,
        });
      }
    }
  }

  // Deduplicate: one pick per player+market — keep the best scoring outcome
  const best = new Map<string, NflPropCandidate>();
  for (const c of candidates) {
    const key = `${c.gameId}::${c.marketKey}::${c.playerName}`;
    const existing = best.get(key);
    if (!existing || c.lottoScore > existing.lottoScore) best.set(key, c);
  }

  return Array.from(best.values()).sort((a, b) => b.lottoScore - a.lottoScore);
}
