export type SoccerCompetitionKey = "world_cup" | "mls";

export type SoccerTeamMarketKey =
  | "three_way_moneyline"
  | "draw_no_bet"
  | "double_chance"
  | "asian_handicap"
  | "game_total_goals"
  | "team_total_goals"
  | "both_teams_to_score";

export type SoccerPropCategoryKey =
  | "attacking"
  | "passing"
  | "defense"
  | "discipline"
  | "keeper"
  | "set_piece";

export type SoccerPropMarketKey =
  | "anytime_goal"
  | "shots"
  | "shots_on_target"
  | "assists"
  | "passes_attempted"
  | "passes_completed"
  | "key_passes"
  | "tackles"
  | "interceptions"
  | "clearances"
  | "cards"
  | "fouls_committed"
  | "saves"
  | "goals_allowed"
  | "corners"
  | "crosses";

export type SoccerTeamMarketDefinition = {
  key: SoccerTeamMarketKey;
  label: string;
  shortLabel: string;
  group: "team";
};

export type SoccerPropMarketDefinition = {
  key: SoccerPropMarketKey;
  label: string;
  shortLabel: string;
  category: SoccerPropCategoryKey;
};

export type SoccerSignalLane = {
  title: string;
  markets: string[];
  modelInputs: string[];
  caution: string;
};

export type SoccerDataLayer = {
  title: string;
  priority: "core" | "high" | "watch";
  items: string[];
};

export type SoccerReadinessTrack = {
  title: string;
  items: string[];
};

export type SoccerOddsOutcome = {
  name: string;
  description?: string;
  price: number;
  point?: number;
};

export type SoccerOddsMarket = {
  key: string;
  outcomes?: SoccerOddsOutcome[];
};

export type SoccerOddsBookmaker = {
  key?: string;
  title?: string;
  markets?: SoccerOddsMarket[];
};

export type SoccerOddsGame = {
  id: string;
  sport_key?: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: SoccerOddsBookmaker[];
};

export type SoccerTeamProfile = {
  rating: number;
  attack: number;
  defense: number;
  form: number;
  chemistry: number;
  coach: number;
  tournamentPedigree: number;
  setPieces: number;
  disciplineRisk: number;
  notes: string[];
};

export type SoccerCandidate = {
  id: string;
  game: SoccerOddsGame;
  competition: SoccerCompetitionKey;
  marketType: "moneyline" | "spread" | "total";
  side: string;
  lineTaken: number | null;
  oddsTaken: number;
  modelProbability: number;
  marketProbability: number;
  edge: number;
  expectedValue: number;
  confidenceScore: number;
  topPickScore: number;
  bestValueScore: number;
  projectedLine: number | null;
  marketLine: number | null;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedMargin: number;
  edgeLabel: string;
  reasonLabels: string[];
  riskFlags: string[];
};

export type EvaluatedSoccerGame = {
  game: SoccerOddsGame;
  competition: SoccerCompetitionKey;
  bookmakerTitle: string;
  homeProfile: SoccerTeamProfile | null;
  awayProfile: SoccerTeamProfile | null;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedMargin: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  marketHomeMoneyline: number | null;
  marketDrawMoneyline: number | null;
  marketAwayMoneyline: number | null;
  marketHomeProbability: number | null;
  marketDrawProbability: number | null;
  marketAwayProbability: number | null;
  candidates: SoccerCandidate[];
  bestCandidate: SoccerCandidate | null;
  modelNotes: string[];
};

const SOCCER_DEFAULT_PROFILE: SoccerTeamProfile = {
  rating: 1540,
  attack: 0,
  defense: 0,
  form: 0,
  chemistry: 0,
  coach: 0,
  tournamentPedigree: 0,
  setPieces: 0,
  disciplineRisk: 0,
  notes: ["Using market-calibrated fallback until deeper team data is connected."],
};

export const SOCCER_TEAM_PROFILES: Record<string, SoccerTeamProfile> = {
  Argentina: {
    rating: 1908,
    attack: 0.28,
    defense: 0.2,
    form: 0.2,
    chemistry: 0.24,
    coach: 0.22,
    tournamentPedigree: 0.35,
    setPieces: 0.08,
    disciplineRisk: 0.02,
    notes: ["Elite tournament continuity and top-end chance creation."],
  },
  Brazil: {
    rating: 1895,
    attack: 0.32,
    defense: 0.15,
    form: 0.12,
    chemistry: 0.15,
    coach: 0.08,
    tournamentPedigree: 0.32,
    setPieces: 0.1,
    disciplineRisk: 0.04,
    notes: ["High attacking ceiling; check lineup balance before backing short prices."],
  },
  France: {
    rating: 1900,
    attack: 0.3,
    defense: 0.18,
    form: 0.18,
    chemistry: 0.2,
    coach: 0.25,
    tournamentPedigree: 0.32,
    setPieces: 0.12,
    disciplineRisk: 0.03,
    notes: ["Deep squad with strong knockout management profile."],
  },
  England: {
    rating: 1858,
    attack: 0.23,
    defense: 0.18,
    form: 0.15,
    chemistry: 0.16,
    coach: 0.14,
    tournamentPedigree: 0.18,
    setPieces: 0.16,
    disciplineRisk: 0.02,
    notes: ["Set-piece strength and defensive floor matter most in tournament pricing."],
  },
  Spain: {
    rating: 1845,
    attack: 0.22,
    defense: 0.17,
    form: 0.18,
    chemistry: 0.2,
    coach: 0.18,
    tournamentPedigree: 0.22,
    setPieces: 0.08,
    disciplineRisk: 0.01,
    notes: ["Possession control can support unders, corners, and pass-volume props."],
  },
  Portugal: {
    rating: 1838,
    attack: 0.24,
    defense: 0.13,
    form: 0.16,
    chemistry: 0.17,
    coach: 0.12,
    tournamentPedigree: 0.18,
    setPieces: 0.14,
    disciplineRisk: 0.03,
    notes: ["Attacking depth creates price sensitivity around confirmed starters."],
  },
  Netherlands: {
    rating: 1815,
    attack: 0.18,
    defense: 0.18,
    form: 0.12,
    chemistry: 0.16,
    coach: 0.16,
    tournamentPedigree: 0.2,
    setPieces: 0.12,
    disciplineRisk: 0.03,
    notes: ["Good structure and set pieces; watch center-back availability."],
  },
  Germany: {
    rating: 1810,
    attack: 0.2,
    defense: 0.12,
    form: 0.08,
    chemistry: 0.14,
    coach: 0.12,
    tournamentPedigree: 0.25,
    setPieces: 0.11,
    disciplineRisk: 0.03,
    notes: ["Pedigree premium can outrun recent form in public markets."],
  },
  Uruguay: {
    rating: 1802,
    attack: 0.16,
    defense: 0.16,
    form: 0.16,
    chemistry: 0.16,
    coach: 0.16,
    tournamentPedigree: 0.2,
    setPieces: 0.12,
    disciplineRisk: 0.08,
    notes: ["Physicality helps pressure markets but can lift card risk."],
  },
  Italy: {
    rating: 1795,
    attack: 0.1,
    defense: 0.22,
    form: 0.08,
    chemistry: 0.14,
    coach: 0.13,
    tournamentPedigree: 0.24,
    setPieces: 0.1,
    disciplineRisk: 0.04,
    notes: ["Defensive profile can make totals more interesting than sides."],
  },
  Belgium: {
    rating: 1778,
    attack: 0.18,
    defense: 0.08,
    form: 0.08,
    chemistry: 0.1,
    coach: 0.08,
    tournamentPedigree: 0.14,
    setPieces: 0.08,
    disciplineRisk: 0.03,
    notes: ["Still dangerous, but age and transition risk should be priced in."],
  },
  "United States": {
    rating: 1748,
    attack: 0.13,
    defense: 0.1,
    form: 0.1,
    chemistry: 0.16,
    coach: 0.08,
    tournamentPedigree: 0.12,
    setPieces: 0.1,
    disciplineRisk: 0.04,
    notes: ["Host boost and crowd pressure both matter; avoid paying pure hype tax."],
  },
  USA: {
    rating: 1748,
    attack: 0.13,
    defense: 0.1,
    form: 0.1,
    chemistry: 0.16,
    coach: 0.08,
    tournamentPedigree: 0.12,
    setPieces: 0.1,
    disciplineRisk: 0.04,
    notes: ["Host boost and crowd pressure both matter; avoid paying pure hype tax."],
  },
  Mexico: {
    rating: 1715,
    attack: 0.09,
    defense: 0.09,
    form: 0.12,
    chemistry: 0.18,
    coach: 0.08,
    tournamentPedigree: 0.14,
    setPieces: 0.1,
    disciplineRisk: 0.05,
    notes: ["Home-host conditions help, but public support can inflate the price."],
  },
  Canada: {
    rating: 1688,
    attack: 0.08,
    defense: 0.04,
    form: 0.08,
    chemistry: 0.14,
    coach: 0.08,
    tournamentPedigree: 0.06,
    setPieces: 0.08,
    disciplineRisk: 0.04,
    notes: ["Host boost is real; opponent quality still decides fair price."],
  },
  Paraguay: {
    rating: 1682,
    attack: 0.0,
    defense: 0.1,
    form: 0.07,
    chemistry: 0.1,
    coach: 0.08,
    tournamentPedigree: 0.12,
    setPieces: 0.08,
    disciplineRisk: 0.07,
    notes: ["Defensive toughness can support underdog cover and unders."],
  },
  "South Africa": {
    rating: 1602,
    attack: -0.02,
    defense: 0.0,
    form: 0.08,
    chemistry: 0.08,
    coach: 0.06,
    tournamentPedigree: 0.02,
    setPieces: 0.06,
    disciplineRisk: 0.04,
    notes: ["Underdog profile needs price discipline and lineup confirmation."],
  },
  "Korea Republic": {
    rating: 1690,
    attack: 0.08,
    defense: 0.04,
    form: 0.08,
    chemistry: 0.12,
    coach: 0.08,
    tournamentPedigree: 0.12,
    setPieces: 0.08,
    disciplineRisk: 0.03,
    notes: ["Star-driven attack, but national-team role can shift club usage."],
  },
  "South Korea": {
    rating: 1690,
    attack: 0.08,
    defense: 0.04,
    form: 0.08,
    chemistry: 0.12,
    coach: 0.08,
    tournamentPedigree: 0.12,
    setPieces: 0.08,
    disciplineRisk: 0.03,
    notes: ["Star-driven attack, but national-team role can shift club usage."],
  },
  Czechia: {
    rating: 1684,
    attack: 0.04,
    defense: 0.08,
    form: 0.08,
    chemistry: 0.1,
    coach: 0.08,
    tournamentPedigree: 0.1,
    setPieces: 0.12,
    disciplineRisk: 0.04,
    notes: ["Set pieces and compact shape make draw/under markets worth checking."],
  },
  "Czech Republic": {
    rating: 1684,
    attack: 0.04,
    defense: 0.08,
    form: 0.08,
    chemistry: 0.1,
    coach: 0.08,
    tournamentPedigree: 0.1,
    setPieces: 0.12,
    disciplineRisk: 0.04,
    notes: ["Set pieces and compact shape make draw/under markets worth checking."],
  },
  "Bosnia and Herzegovina": {
    rating: 1625,
    attack: 0.02,
    defense: -0.02,
    form: 0.02,
    chemistry: 0.06,
    coach: 0.04,
    tournamentPedigree: 0.04,
    setPieces: 0.08,
    disciplineRisk: 0.04,
    notes: ["Watch striker usage and defensive availability before props."],
  },
  Scotland: {
    rating: 1645,
    attack: 0.0,
    defense: 0.05,
    form: 0.04,
    chemistry: 0.08,
    coach: 0.08,
    tournamentPedigree: 0.06,
    setPieces: 0.1,
    disciplineRisk: 0.05,
    notes: ["Set-piece and physical-matchup angles can outrun side markets."],
  },
  Haiti: {
    rating: 1510,
    attack: -0.04,
    defense: -0.06,
    form: 0.02,
    chemistry: 0.04,
    coach: 0.02,
    tournamentPedigree: 0.0,
    setPieces: 0.03,
    disciplineRisk: 0.05,
    notes: ["Treat as high-variance underdog until lineup data is stronger."],
  },
};

export const SOCCER_COMPETITIONS: Array<{
  key: SoccerCompetitionKey;
  label: string;
  status: string;
  emphasis: string;
}> = [
  {
    key: "world_cup",
    label: "World Cup",
    status: "Default board",
    emphasis: "Short tournament pricing, national-team chemistry, travel, rest, venue, and knockout incentives.",
  },
  {
    key: "mls",
    label: "MLS",
    status: "League board",
    emphasis: "Longer-season form, travel distance, rotation, home-field strength, and roster availability.",
  },
];

export const SOCCER_TEAM_MARKETS: SoccerTeamMarketDefinition[] = [
  { key: "three_way_moneyline", label: "3-Way Moneyline", shortLabel: "1X2", group: "team" },
  { key: "draw_no_bet", label: "Draw No Bet", shortLabel: "DNB", group: "team" },
  { key: "double_chance", label: "Double Chance", shortLabel: "DC", group: "team" },
  { key: "asian_handicap", label: "Asian Handicap", shortLabel: "AH", group: "team" },
  { key: "game_total_goals", label: "Game Total Goals", shortLabel: "Total", group: "team" },
  { key: "team_total_goals", label: "Team Total Goals", shortLabel: "Team TT", group: "team" },
  { key: "both_teams_to_score", label: "Both Teams To Score", shortLabel: "BTTS", group: "team" },
];

export const SOCCER_PROP_MARKETS: SoccerPropMarketDefinition[] = [
  { key: "anytime_goal", label: "Anytime Goal", shortLabel: "Goal", category: "attacking" },
  { key: "shots", label: "Shots", shortLabel: "Shots", category: "attacking" },
  { key: "shots_on_target", label: "Shots On Target", shortLabel: "SOT", category: "attacking" },
  { key: "assists", label: "Assists", shortLabel: "Ast", category: "attacking" },
  { key: "passes_attempted", label: "Passes Attempted", shortLabel: "Pass Att", category: "passing" },
  { key: "passes_completed", label: "Passes Completed", shortLabel: "Pass Cmp", category: "passing" },
  { key: "key_passes", label: "Key Passes", shortLabel: "Key Pass", category: "passing" },
  { key: "tackles", label: "Tackles", shortLabel: "Tkl", category: "defense" },
  { key: "interceptions", label: "Interceptions", shortLabel: "Int", category: "defense" },
  { key: "clearances", label: "Clearances", shortLabel: "Clr", category: "defense" },
  { key: "cards", label: "Cards", shortLabel: "Cards", category: "discipline" },
  { key: "fouls_committed", label: "Fouls Committed", shortLabel: "Fouls", category: "discipline" },
  { key: "saves", label: "Keeper Saves", shortLabel: "Saves", category: "keeper" },
  { key: "goals_allowed", label: "Keeper Goals Allowed", shortLabel: "GA", category: "keeper" },
  { key: "corners", label: "Corners", shortLabel: "Corners", category: "set_piece" },
  { key: "crosses", label: "Crosses", shortLabel: "Crosses", category: "set_piece" },
];

export const SOCCER_PROP_CATEGORY_LABELS: Record<SoccerPropCategoryKey, string> = {
  attacking: "Attacking",
  passing: "Passing",
  defense: "Defensive Work",
  discipline: "Cards And Fouls",
  keeper: "Goalkeeper",
  set_piece: "Set Pieces",
};

export const SOCCER_WORLD_CUP_SIGNAL_LANES: SoccerSignalLane[] = [
  {
    title: "Match Result Value",
    markets: ["3-way moneyline", "draw no bet", "double chance", "Asian handicap"],
    modelInputs: ["Elo form", "squad health", "manager setup", "travel/rest", "venue familiarity"],
    caution: "World Cup favorites get public money fast, so the model should price the draw and underdog cover before backing a popular side.",
  },
  {
    title: "Goal Environment",
    markets: ["game total", "team total", "both teams to score"],
    modelInputs: ["xG profile", "shot quality", "defensive block", "keeper form", "game-state incentives"],
    caution: "Tournament openers, third group games, and knockout ties behave differently; the model needs stage-specific rules.",
  },
  {
    title: "Player Attack Props",
    markets: ["shots", "shots on target", "anytime goal", "assists"],
    modelInputs: ["club role", "national-team role", "set-piece share", "teammate creation", "opponent concession map"],
    caution: "A player can be elite at club level but lose volume if the national team uses them wider, deeper, or as a decoy.",
  },
  {
    title: "Control And Pressure Props",
    markets: ["passes", "tackles", "interceptions", "fouls"],
    modelInputs: ["expected possession", "pressing matchup", "midfield pairing", "referee card rate", "scoreline paths"],
    caution: "These markets are more lineup-sensitive than reputation-sensitive; confirmed roles matter more than name value.",
  },
  {
    title: "Cards, Corners, And Set Pieces",
    markets: ["cards", "corners", "crosses", "free-kick involvement"],
    modelInputs: ["referee profile", "wing attack rate", "discipline history", "set-piece takers", "late-game urgency"],
    caution: "Books often shade high-profile rivalry games; the model should separate real tactical pressure from public narrative.",
  },
  {
    title: "Keeper And Defensive Volume",
    markets: ["saves", "goals allowed", "clean sheet", "defensive actions"],
    modelInputs: ["shot volume faced", "shot-on-target quality", "keeper shot-stopping", "center-back availability", "underdog bunker rate"],
    caution: "Save props can look attractive for overmatched teams, but early goals can break the game script in either direction.",
  },
];

export const SOCCER_DATA_LAYERS: SoccerDataLayer[] = [
  {
    title: "Old World Cup Archive",
    priority: "core",
    items: [
      "match results, score state, extra time, penalties, and group-stage incentives",
      "lineups, substitutions, minutes, captaincy, and formation shifts",
      "team xG, shots, cards, corners, possession, and rest days by match",
      "knockout vs group-stage splits, host-continent effects, and travel distances",
    ],
  },
  {
    title: "Player History",
    priority: "core",
    items: [
      "club-season minutes, goals, assists, xG, xA, shots, passing, and defensive work",
      "national-team role, minutes, position, set-piece share, and usage volatility",
      "recent form windows across 3, 5, 10, and 20 appearances",
      "injury return timeline, fatigue, age curve, and tournament experience",
    ],
  },
  {
    title: "Player Chemistry",
    priority: "high",
    items: [
      "shared club/team minutes between projected starters",
      "pass-completion and chance-creation pairs",
      "attacker-provider links, center-back partnerships, and midfield triangles",
      "lineup continuity, language/club familiarity proxies, and replacement drop-offs",
    ],
  },
  {
    title: "Coach And Tactics",
    priority: "high",
    items: [
      "manager tenure, preferred shape, press height, tempo, and substitution timing",
      "historical results against similar tactical profiles",
      "set-piece design, penalty taker hierarchy, and late-game risk appetite",
      "coach changes, assistant staff continuity, and tournament knockout behavior",
    ],
  },
  {
    title: "Market And Public Context",
    priority: "core",
    items: [
      "opening number, current number, implied probability, and line movement",
      "book spread, vig, limits, and stale-price checks",
      "public-favorite inflation around host nations, stars, and defending champions",
      "model price vs market price with minimum edge and liquidity guardrails",
    ],
  },
  {
    title: "Environment And Officials",
    priority: "watch",
    items: [
      "venue altitude, surface, weather, heat, humidity, and kickoff time",
      "referee card, foul, penalty, and stoppage-time tendencies",
      "travel base, rest gap, time zone shift, and crowd/host pressure",
      "VAR-era changes compared with older World Cups",
    ],
  },
];

export const SOCCER_MODEL_READINESS_TRACKS: SoccerReadinessTrack[] = [
  {
    title: "Data Intake",
    items: [
      "FIFA schedule and results",
      "World Cup historical match logs",
      "player match logs and club form",
      "confirmed lineups and injury reports",
    ],
  },
  {
    title: "Feature Engine",
    items: [
      "team strength and form ratings",
      "player role and usage projections",
      "chemistry and lineup continuity",
      "coach/tactical tendency adjustments",
    ],
  },
  {
    title: "Bet Selection",
    items: [
      "fair odds and implied probability",
      "edge threshold by market liquidity",
      "public-price inflation checks",
      "Top Pick and Best Value lanes",
    ],
  },
];

export const SOCCER_RELEVANT_IDEAS: SoccerReadinessTrack[] = [
  {
    title: "Tournament-Specific Angles",
    items: [
      "third group match qualification incentives",
      "extra-time penalty in knockout unders",
      "host-nation pricing premium",
      "rest mismatch after travel-heavy fixtures",
    ],
  },
  {
    title: "Player Prop Angles",
    items: [
      "set-piece monopoly for shots and assists",
      "wide defender crossing volume",
      "keeper saves for high-shot underdogs",
      "card risk for isolated fullbacks and holding mids",
    ],
  },
  {
    title: "Market Discipline",
    items: [
      "avoid thin props without lineup confirmation",
      "separate club form from national-team role",
      "downgrade old data before the VAR era",
      "track closing-line value on every saved pick",
    ],
  },
];

function normalizeTeamKey(team: string) {
  return team
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTeamProfile(team: string): SoccerTeamProfile | null {
  const direct = SOCCER_TEAM_PROFILES[team];
  if (direct) return direct;

  const normalized = normalizeTeamKey(team);
  const match = Object.entries(SOCCER_TEAM_PROFILES).find(
    ([name]) => normalizeTeamKey(name) === normalized
  );

  return match?.[1] ?? null;
}

function getModelProfile(team: string) {
  return getTeamProfile(team) ?? SOCCER_DEFAULT_PROFILE;
}

export function americanToImpliedProbability(odds: number | null | undefined) {
  if (odds === null || odds === undefined || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToProfitPerUnit(odds: number) {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function poisson(lambda: number, goals: number) {
  let factorial = 1;
  for (let index = 2; index <= goals; index += 1) {
    factorial *= index;
  }

  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

function getStageAdjustment(competition: SoccerCompetitionKey, commenceTime: string) {
  if (competition !== "world_cup") return { total: 0, draw: 0, label: "League match" };

  const matchDate = new Date(commenceTime);
  if (Number.isNaN(matchDate.getTime())) return { total: -0.05, draw: 0.015, label: "Tournament match" };

  const knockoutStart = Date.UTC(2026, 5, 28, 0, 0, 0);
  const matchTime = matchDate.getTime();

  if (matchTime >= knockoutStart) {
    return { total: -0.14, draw: 0.035, label: "Knockout caution" };
  }

  const thirdGroupStart = Date.UTC(2026, 5, 24, 0, 0, 0);
  if (matchTime >= thirdGroupStart) {
    return { total: 0.04, draw: -0.005, label: "Group incentive volatility" };
  }

  return { total: -0.07, draw: 0.02, label: "Group-stage opener profile" };
}

function getHostBoost(team: string, competition: SoccerCompetitionKey) {
  if (competition !== "world_cup") return 0;
  const key = normalizeTeamKey(team);
  if (key === "mexico") return 42;
  if (key === "united states" || key === "usa") return 35;
  if (key === "canada") return 32;
  return 0;
}

function estimateSoccerScore(params: {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  competition: SoccerCompetitionKey;
}) {
  const homeProfile = getModelProfile(params.homeTeam);
  const awayProfile = getModelProfile(params.awayTeam);
  const stage = getStageAdjustment(params.competition, params.commenceTime);
  const homeBoost = getHostBoost(params.homeTeam, params.competition);
  const awayBoost = getHostBoost(params.awayTeam, params.competition) * 0.65;
  const baseTotal = params.competition === "world_cup" ? 2.42 : 2.74;
  const ratingDiff = homeProfile.rating + homeBoost - (awayProfile.rating + awayBoost);
  const formDiff =
    homeProfile.form +
    homeProfile.chemistry * 0.55 +
    homeProfile.coach * 0.4 +
    homeProfile.tournamentPedigree * 0.25 -
    (awayProfile.form + awayProfile.chemistry * 0.55 + awayProfile.coach * 0.4 + awayProfile.tournamentPedigree * 0.25);
  const attackEnvironment =
    homeProfile.attack +
    awayProfile.attack -
    (homeProfile.defense + awayProfile.defense) * 0.45 +
    (homeProfile.setPieces + awayProfile.setPieces) * 0.12;
  const projectedMargin = clamp(ratingDiff / 185 + formDiff * 0.55, -2.4, 2.4);
  const projectedTotal = clamp(baseTotal + attackEnvironment * 0.5 + stage.total, 1.55, 4.25);
  const projectedHomeScore = clamp(projectedTotal / 2 + projectedMargin / 2, 0.15, 4.2);
  const projectedAwayScore = clamp(projectedTotal - projectedHomeScore, 0.15, 4.2);

  return {
    stage,
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal: projectedHomeScore + projectedAwayScore,
    projectedMargin: projectedHomeScore - projectedAwayScore,
  };
}

function getScoreGrid(homeGoals: number, awayGoals: number) {
  const maxGoals = 9;
  const grid: Array<{ home: number; away: number; probability: number }> = [];
  let totalProbability = 0;

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      const probability = poisson(homeGoals, home) * poisson(awayGoals, away);
      totalProbability += probability;
      grid.push({ home, away, probability });
    }
  }

  return grid.map((row) => ({
    ...row,
    probability: row.probability / totalProbability,
  }));
}

function getOutcomeProbabilities(homeGoals: number, awayGoals: number, drawAdjustment = 0) {
  const grid = getScoreGrid(homeGoals, awayGoals);
  const raw = grid.reduce(
    (totals, row) => {
      if (row.home > row.away) totals.home += row.probability;
      else if (row.home < row.away) totals.away += row.probability;
      else totals.draw += row.probability;
      return totals;
    },
    { home: 0, draw: 0, away: 0 }
  );
  const adjustedDraw = clamp(raw.draw + drawAdjustment, 0.08, 0.38);
  const sideScale = (1 - adjustedDraw) / Math.max(0.01, raw.home + raw.away);

  return {
    home: raw.home * sideScale,
    draw: adjustedDraw,
    away: raw.away * sideScale,
  };
}

function getSpreadProbability(params: {
  homeGoals: number;
  awayGoals: number;
  homeTeam: string;
  outcome: SoccerOddsOutcome;
}) {
  const point = params.outcome.point ?? 0;
  const isHome = params.outcome.name === params.homeTeam;
  const grid = getScoreGrid(params.homeGoals, params.awayGoals);

  return grid.reduce((total, row) => {
    const margin = row.home - row.away;
    const adjusted = isHome ? margin + point : -margin + point;
    if (adjusted > 0) return total + row.probability;
    if (Math.abs(adjusted) < 0.001) return total + row.probability * 0.5;
    return total;
  }, 0);
}

function getTotalProbability(params: {
  homeGoals: number;
  awayGoals: number;
  outcome: SoccerOddsOutcome;
}) {
  const point = params.outcome.point ?? 2.5;
  const wantsOver = params.outcome.name.toLowerCase() === "over";
  const grid = getScoreGrid(params.homeGoals, params.awayGoals);

  return grid.reduce((total, row) => {
    const goals = row.home + row.away;
    const adjusted = wantsOver ? goals - point : point - goals;
    if (adjusted > 0) return total + row.probability;
    if (Math.abs(adjusted) < 0.001) return total + row.probability * 0.5;
    return total;
  }, 0);
}

function getBookmaker(game: SoccerOddsGame) {
  return (
    game.bookmakers?.find((bookmaker) => bookmaker.key === "draftkings") ??
    game.bookmakers?.[0] ??
    null
  );
}

function getMarket(bookmaker: SoccerOddsBookmaker | null, key: string) {
  return bookmaker?.markets?.find((market) => market.key === key) ?? null;
}

function getOutcome(market: SoccerOddsMarket | null, name: string) {
  return market?.outcomes?.find((outcome) => outcome.name === name) ?? null;
}

function noVigProbabilities(outcomes: SoccerOddsOutcome[]) {
  const raw = outcomes.map((outcome) => ({
    name: outcome.name,
    probability: americanToImpliedProbability(outcome.price) ?? 0,
  }));
  const total = raw.reduce((sum, row) => sum + row.probability, 0);

  if (total <= 0) return new Map<string, number>();
  return new Map(raw.map((row) => [row.name, row.probability / total]));
}

function buildCandidate(params: {
  game: SoccerOddsGame;
  competition: SoccerCompetitionKey;
  marketType: SoccerCandidate["marketType"];
  side: string;
  lineTaken: number | null;
  oddsTaken: number;
  modelProbability: number;
  marketProbability: number;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedMargin: number;
  stageLabel: string;
  reasonLabels: string[];
  riskFlags: string[];
}) {
  const profit = americanToProfitPerUnit(params.oddsTaken);
  const expectedValue = params.modelProbability * profit - (1 - params.modelProbability);
  const edge = expectedValue * 100;
  const probabilityGap = (params.modelProbability - params.marketProbability) * 100;
  const oddsRisk =
    params.oddsTaken <= -220 ? -8 : params.oddsTaken >= 450 ? -6 : params.oddsTaken >= 300 ? -2 : 0;
  const totalRisk = params.marketType === "total" && Math.abs(params.projectedTotal - (params.lineTaken ?? params.projectedTotal)) < 0.12 ? -6 : 0;
  const confidenceScore = clamp(
    45 + edge * 1.25 + probabilityGap * 0.8 + oddsRisk + totalRisk,
    1,
    96
  );
  const id = [
    params.game.id,
    params.marketType,
    params.side,
    params.lineTaken ?? "none",
  ].join("::");
  const edgeLabel = [
    `${params.competition === "world_cup" ? "World Cup" : "MLS"} ${params.marketType}`,
    `${round(params.modelProbability * 100, 1)}% model vs ${round(params.marketProbability * 100, 1)}% market`,
    `${round(edge, 1)}% EV`,
    params.stageLabel,
  ].join(" | ");

  return {
    id,
    game: params.game,
    competition: params.competition,
    marketType: params.marketType,
    side: params.side,
    lineTaken: params.lineTaken,
    oddsTaken: params.oddsTaken,
    modelProbability: round(params.modelProbability, 4),
    marketProbability: round(params.marketProbability, 4),
    edge: round(edge, 1),
    expectedValue: round(expectedValue, 4),
    confidenceScore: round(confidenceScore, 1),
    topPickScore: round(confidenceScore + Math.max(0, edge) * 0.6 + probabilityGap * 0.25, 1),
    bestValueScore: round(edge + profit * 4 + Math.max(0, probabilityGap) * 0.25, 1),
    projectedLine:
      params.marketType === "total"
        ? round(params.projectedTotal, 2)
        : params.marketType === "spread"
          ? round(params.projectedMargin, 2)
          : round(params.modelProbability * 100, 1),
    marketLine:
      params.marketType === "moneyline"
        ? round(params.marketProbability * 100, 1)
        : params.lineTaken,
    projectedHomeScore: round(params.projectedHomeScore, 2),
    projectedAwayScore: round(params.projectedAwayScore, 2),
    projectedTotal: round(params.projectedTotal, 2),
    projectedMargin: round(params.projectedMargin, 2),
    edgeLabel,
    reasonLabels: params.reasonLabels,
    riskFlags: params.riskFlags,
  } satisfies SoccerCandidate;
}

function getCandidateRiskFlags(candidate: SoccerCandidate) {
  const flags = [...candidate.riskFlags];
  if (candidate.oddsTaken <= -240) flags.push("Expensive price");
  if (candidate.oddsTaken >= 425) flags.push("Long-shot variance");
  if (candidate.marketType === "moneyline" && candidate.side === "Draw") flags.push("Draw volatility");
  if (candidate.competition === "world_cup" && candidate.marketType === "moneyline" && candidate.side !== "Draw") {
    flags.push("Public favorite check");
  }
  return Array.from(new Set(flags));
}

function isCandidateEligible(candidate: SoccerCandidate) {
  if (new Date(candidate.game.commence_time).getTime() <= Date.now()) return false;
  if (candidate.modelProbability < 0.16) return false;
  if (candidate.edge < 3.4) return false;
  if (candidate.confidenceScore < 50) return false;
  if (candidate.oddsTaken <= -360 || candidate.oddsTaken >= 700) return false;
  if (candidate.marketType === "moneyline" && candidate.side !== "Draw" && candidate.edge < 4.2) return false;
  return true;
}

export function evaluateSoccerGames(
  games: SoccerOddsGame[],
  competition: SoccerCompetitionKey
): EvaluatedSoccerGame[] {
  return games.map((game) => {
    const bookmaker = getBookmaker(game);
    const h2h = getMarket(bookmaker, "h2h");
    const spreads = getMarket(bookmaker, "spreads");
    const totals = getMarket(bookmaker, "totals");
    const homeProfile = getTeamProfile(game.home_team);
    const awayProfile = getTeamProfile(game.away_team);
    const score = estimateSoccerScore({
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      commenceTime: game.commence_time,
      competition,
    });
    const probs = getOutcomeProbabilities(
      score.projectedHomeScore,
      score.projectedAwayScore,
      score.stage.draw
    );
    const h2hNoVig = noVigProbabilities(h2h?.outcomes ?? []);
    const candidates: SoccerCandidate[] = [];
    const reasonLabels = [
      score.stage.label,
      homeProfile ? `${game.home_team} profile` : `${game.home_team} fallback profile`,
      awayProfile ? `${game.away_team} profile` : `${game.away_team} fallback profile`,
    ];
    const riskFlags = [
      !homeProfile || !awayProfile ? "Missing full team profile" : null,
      competition === "world_cup" ? "Lineup confirmation important" : null,
    ].filter((item): item is string => Boolean(item));

    for (const outcome of h2h?.outcomes ?? []) {
      const marketProbability = h2hNoVig.get(outcome.name) ?? americanToImpliedProbability(outcome.price) ?? 0;
      const modelProbability =
        outcome.name === game.home_team
          ? probs.home
          : outcome.name === game.away_team
            ? probs.away
            : probs.draw;

      candidates.push(
        buildCandidate({
          game,
          competition,
          marketType: "moneyline",
          side: outcome.name,
          lineTaken: null,
          oddsTaken: outcome.price,
          modelProbability,
          marketProbability,
          projectedHomeScore: score.projectedHomeScore,
          projectedAwayScore: score.projectedAwayScore,
          projectedTotal: score.projectedTotal,
          projectedMargin: score.projectedMargin,
          stageLabel: score.stage.label,
          reasonLabels,
          riskFlags,
        })
      );
    }

    for (const outcome of spreads?.outcomes ?? []) {
      const marketProbability = americanToImpliedProbability(outcome.price) ?? 0;
      const modelProbability = getSpreadProbability({
        homeGoals: score.projectedHomeScore,
        awayGoals: score.projectedAwayScore,
        homeTeam: game.home_team,
        outcome,
      });
      const signedPoint =
        outcome.point === undefined
          ? null
          : outcome.point > 0
            ? `+${outcome.point}`
            : `${outcome.point}`;

      candidates.push(
        buildCandidate({
          game,
          competition,
          marketType: "spread",
          side: signedPoint ? `${outcome.name} ${signedPoint}` : outcome.name,
          lineTaken: outcome.point ?? null,
          oddsTaken: outcome.price,
          modelProbability,
          marketProbability,
          projectedHomeScore: score.projectedHomeScore,
          projectedAwayScore: score.projectedAwayScore,
          projectedTotal: score.projectedTotal,
          projectedMargin: score.projectedMargin,
          stageLabel: score.stage.label,
          reasonLabels,
          riskFlags,
        })
      );
    }

    for (const outcome of totals?.outcomes ?? []) {
      const marketProbability = americanToImpliedProbability(outcome.price) ?? 0;
      const modelProbability = getTotalProbability({
        homeGoals: score.projectedHomeScore,
        awayGoals: score.projectedAwayScore,
        outcome,
      });

      candidates.push(
        buildCandidate({
          game,
          competition,
          marketType: "total",
          side: `${outcome.name} ${outcome.point ?? ""}`.trim(),
          lineTaken: outcome.point ?? null,
          oddsTaken: outcome.price,
          modelProbability,
          marketProbability,
          projectedHomeScore: score.projectedHomeScore,
          projectedAwayScore: score.projectedAwayScore,
          projectedTotal: score.projectedTotal,
          projectedMargin: score.projectedMargin,
          stageLabel: score.stage.label,
          reasonLabels,
          riskFlags,
        })
      );
    }

    const eligibleCandidates = candidates
      .map((candidate) => ({ ...candidate, riskFlags: getCandidateRiskFlags(candidate) }))
      .filter(isCandidateEligible)
      .sort((a, b) => b.topPickScore - a.topPickScore);
    const marketHomeMoneyline = getOutcome(h2h, game.home_team)?.price ?? null;
    const marketDrawMoneyline = getOutcome(h2h, "Draw")?.price ?? null;
    const marketAwayMoneyline = getOutcome(h2h, game.away_team)?.price ?? null;

    return {
      game,
      competition,
      bookmakerTitle: bookmaker?.title ?? bookmaker?.key ?? "Best available book",
      homeProfile,
      awayProfile,
      projectedHomeScore: round(score.projectedHomeScore, 2),
      projectedAwayScore: round(score.projectedAwayScore, 2),
      projectedTotal: round(score.projectedTotal, 2),
      projectedMargin: round(score.projectedMargin, 2),
      homeWinProbability: round(probs.home, 4),
      drawProbability: round(probs.draw, 4),
      awayWinProbability: round(probs.away, 4),
      marketHomeMoneyline,
      marketDrawMoneyline,
      marketAwayMoneyline,
      marketHomeProbability: h2hNoVig.get(game.home_team) ?? null,
      marketDrawProbability: h2hNoVig.get("Draw") ?? null,
      marketAwayProbability: h2hNoVig.get(game.away_team) ?? null,
      candidates: eligibleCandidates,
      bestCandidate: eligibleCandidates[0] ?? null,
      modelNotes: [
        score.stage.label,
        ...(homeProfile?.notes ?? [`${game.home_team}: fallback profile`]),
        ...(awayProfile?.notes ?? [`${game.away_team}: fallback profile`]),
      ].slice(0, 5),
    } satisfies EvaluatedSoccerGame;
  });
}

export function soccerCandidateKey(candidate: SoccerCandidate) {
  return candidate.id;
}

function selectUniqueCandidates(
  candidates: SoccerCandidate[],
  maxCount: number,
  existingGameIds = new Set<string>()
) {
  const selected: SoccerCandidate[] = [];
  const usedGames = new Set(existingGameIds);
  const usedMarkets = new Set<string>();

  for (const candidate of candidates) {
    const marketKey = `${candidate.game.id}::${candidate.marketType}`;
    if (usedGames.has(candidate.game.id)) continue;
    if (usedMarkets.has(marketKey)) continue;

    selected.push(candidate);
    usedGames.add(candidate.game.id);
    usedMarkets.add(marketKey);

    if (selected.length >= maxCount) break;
  }

  return selected;
}

export function selectSoccerBoardCandidates(candidates: SoccerCandidate[]) {
  const topCandidates = selectUniqueCandidates(
    [...candidates].sort((a, b) => b.topPickScore - a.topPickScore),
    3
  );
  const topKeys = new Set(topCandidates.map(soccerCandidateKey));
  const topGameIds = new Set(topCandidates.map((candidate) => candidate.game.id));
  const bestValueCandidates = selectUniqueCandidates(
    [...candidates]
      .filter((candidate) => !topKeys.has(soccerCandidateKey(candidate)))
      .sort((a, b) => b.bestValueScore - a.bestValueScore),
    3,
    topGameIds
  );

  return { topCandidates, bestValueCandidates };
}

export function getSoccerDisplayCompetition(competition: SoccerCompetitionKey) {
  return competition === "world_cup" ? "World Cup" : "MLS";
}
