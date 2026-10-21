import fs from "node:fs";
import path from "node:path";

// Loader for data/picks/nba-parlays-<date>.json, produced by scripts/build-nba-parlays.mjs
// (one 25-leg longshot ticket plus top single picks per NBA day).

export type NbaParlayLeg = {
  game: string;
  startTime: string;
  pick: string;
  market: string;
  price: number;
  hitProb: number;
  marketProb: number;
  modelProb: number | null;
  projection: number | null;
  team: string | null;
  kind: "game" | "prop";
  // Where the line came from; files built before FanDuel lines were added have no book (DraftKings).
  book?: "fanduel" | "draftkings";
  // Set when the user placed this leg at a different FanDuel line: the saved pick it replaced.
  placedFrom?: string;
};

export const isDkLeg = (leg: { book?: string }) => leg.book !== "fanduel";

export type NbaTopPick = NbaParlayLeg & { ev: number };

export type NbaParlayDay = {
  version: number;
  date: string;
  builtAt: string;
  inputsSnapshot: string;
  source: string;
  games: { id: string; label: string; startTime: string }[];
  ticket: {
    legs: NbaParlayLeg[];
    stake: number;
    perGameCap: number;
    maxPerGame: number;
    priceTilt: number;
    rawPayout: number;
    fanduelEstimate: number;
    haircutFactor: number;
    hitChance: number;
    avgLegHit: number;
    // Present once the lines actually placed on FanDuel were recorded (scripts/apply-nba-placed-lines.mjs).
    // stake/payout: the real bet and FanDuel's quote; haircut = plain product / FanDuel's real odds.
    placed?: { at: string; note: string; changed: number; stake?: number; payout?: number; haircut?: number };
  };
  // Sorted by hit probability, highest first.
  topPicks: NbaTopPick[];
  poolSize: number;
  // Earlier pre-tip builds of the same day, oldest first. Never edited.
  history: Omit<NbaParlayDay, "history">[];
};

const PICKS_DIR = path.join(process.cwd(), "data", "picks");

export function loadNbaParlayDay(date: string): NbaParlayDay | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(PICKS_DIR, `nba-parlays-${date}.json`), "utf8")) as NbaParlayDay;
  } catch {
    return null;
  }
}

export function listNbaParlayDates(): string[] {
  try {
    return fs
      .readdirSync(PICKS_DIR)
      .map((file) => file.match(/^nba-parlays-(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
      .filter((date): date is string => Boolean(date))
      .sort();
  } catch {
    return [];
  }
}

// Loader for data/picks/nba-sets-<date>.json (one pick per game + single-game sets),
// also written by scripts/build-nba-parlays.mjs, and its graded .results.json beside it.

export type NbaSetLeg = NbaParlayLeg & {
  gameId: string;
  player: string | null;
  playerId: string | null;
  line: number | null;
  side: string | null;
  loweredFrom?: string | null;
  // Set when this leg replaced one FanDuel doesn't offer (scripts/replace-nba-set-leg.mjs).
  replacedFrom?: string | null;
};

export type NbaOnePerGame = {
  builtAt: string;
  inputsSnapshot?: string;
  legs: NbaSetLeg[];
  // Plain decimal product of the legs.
  odds: number;
  american: number;
  hitChance: number;
};

export type NbaGameTicket = {
  legs: NbaSetLeg[];
  lowered: number;
  sharesWithTicket1: number;
  odds: number;
  hitChance: number;
};

export type NbaGameSet = {
  gameId: string;
  label: string;
  startTime: string;
  builtAt: string;
  inputsSnapshot?: string;
  legsPerTicket: number;
  cap: number;
  tickets: NbaGameTicket[];
  // Earlier pre-tip builds of this game's set. Never edited.
  history: Omit<NbaGameSet, "history">[];
};

export type NbaSetsDay = {
  version: number;
  date: string;
  source: string;
  updatedAt: string;
  onePerGame: NbaOnePerGame | null;
  // Earlier versions of the one-per-game ticket. Never edited.
  onePerGameHistory: NbaOnePerGame[];
  // A game is missing when there weren't enough props yet.
  games: Record<string, NbaGameSet>;
};

export type NbaLegStatus = "won" | "lost" | "void" | "push" | "ungradable" | "pending";

export type NbaTicketResult = {
  odds: number;
  hitChance?: number;
  status: NbaLegStatus;
  won: number;
  lost: number;
  void: number;
  pending: number;
  oddsIfWon: number | null;
  legs: { pick: string; game: string; result: { status: NbaLegStatus; actual?: number; note?: string } }[];
};

export type NbaSetsResults = {
  date: string;
  gradedAt: string;
  onePerGame: NbaTicketResult | null;
  games: Record<string, { label: string; tickets: NbaTicketResult[] }>;
};

// data/picks/nba-parlays-<date>.results.json (npm run grade:nba-parlays): grades for the 25-leg
// ticket and the top single picks. Legs carry the same pick text as the saved file.
export type NbaParlayResults = {
  date: string;
  gradedAt: string;
  ticket: NbaTicketResult & { stake?: number; fanduelPayoutIfWon?: number | null };
  topPicks: { won: number; lost: number; void: number; pending: number; picks: NbaTicketResult["legs"] };
};

// data/picks/nba-recap-<date>.json: a written review of the night (what happened and what it
// teaches), saved alongside the picks and results. New versions replace nothing: they are
// appended to `updates`, and the page shows them all.
export type NbaNightRecap = {
  date: string;
  updates: {
    at: string;
    gamesFinal: string;
    headline: string;
    games: { label: string; result: string; notes: string[] }[];
    record: string[];
    lessons: string[];
  }[];
};

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(PICKS_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadNbaSetsDay(date: string): NbaSetsDay | null {
  return readJson<NbaSetsDay>(`nba-sets-${date}.json`);
}

export function loadNbaSetsResults(date: string): NbaSetsResults | null {
  return readJson<NbaSetsResults>(`nba-sets-${date}.results.json`);
}

export function loadNbaParlayResults(date: string): NbaParlayResults | null {
  return readJson<NbaParlayResults>(`nba-parlays-${date}.results.json`);
}

export function loadNbaNightRecap(date: string): NbaNightRecap | null {
  return readJson<NbaNightRecap>(`nba-recap-${date}.json`);
}

export function listNbaSetsDates(): string[] {
  try {
    return fs
      .readdirSync(PICKS_DIR)
      .map((file) => file.match(/^nba-sets-(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
      .filter((date): date is string => Boolean(date))
      .sort();
  } catch {
    return [];
  }
}
