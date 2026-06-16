export type NflTeamMarketKey =
  | "moneyline"
  | "spread"
  | "game_total"
  | "home_team_total"
  | "away_team_total";

export type NflPropCategoryKey =
  | "passing"
  | "rushing"
  | "receiving"
  | "combo"
  | "scoring"
  | "kicking"
  | "defense";

export type NflPropMarketKey =
  | "passing_yards"
  | "passing_tds"
  | "pass_attempts"
  | "pass_completions"
  | "passing_interceptions"
  | "longest_completion"
  | "rushing_yards"
  | "rushing_attempts"
  | "longest_rush"
  | "rushing_tds"
  | "receiving_yards"
  | "receptions"
  | "targets"
  | "longest_reception"
  | "receiving_tds"
  | "rush_plus_rec_yards"
  | "qb_pass_plus_rush_yards"
  | "anytime_td"
  | "first_td"
  | "field_goals_made"
  | "longest_field_goal"
  | "extra_points_made"
  | "tackles_plus_assists"
  | "sacks"
  | "interceptions";

export type NflTeamMarketDefinition = {
  key: NflTeamMarketKey;
  label: string;
  shortLabel: string;
  group: "team";
};

export type NflPropMarketDefinition = {
  key: NflPropMarketKey;
  label: string;
  shortLabel: string;
  category: NflPropCategoryKey;
};

export const NFL_TEAM_MARKETS: NflTeamMarketDefinition[] = [
  { key: "moneyline", label: "Moneyline", shortLabel: "ML", group: "team" },
  { key: "spread", label: "Spread", shortLabel: "ATS", group: "team" },
  { key: "game_total", label: "Game Total", shortLabel: "Total", group: "team" },
  { key: "home_team_total", label: "Home Team Total", shortLabel: "Home TT", group: "team" },
  { key: "away_team_total", label: "Away Team Total", shortLabel: "Away TT", group: "team" },
];

export const NFL_PROP_MARKETS: NflPropMarketDefinition[] = [
  { key: "passing_yards", label: "Passing Yards", shortLabel: "Pass Yds", category: "passing" },
  { key: "passing_tds", label: "Passing Touchdowns", shortLabel: "Pass TDs", category: "passing" },
  { key: "pass_attempts", label: "Pass Attempts", shortLabel: "Attempts", category: "passing" },
  { key: "pass_completions", label: "Completions", shortLabel: "Comps", category: "passing" },
  { key: "passing_interceptions", label: "Interceptions", shortLabel: "INTs", category: "passing" },
  { key: "longest_completion", label: "Longest Completion", shortLabel: "Long Comp", category: "passing" },
  { key: "rushing_yards", label: "Rushing Yards", shortLabel: "Rush Yds", category: "rushing" },
  { key: "rushing_attempts", label: "Rushing Attempts", shortLabel: "Carries", category: "rushing" },
  { key: "longest_rush", label: "Longest Rush", shortLabel: "Long Rush", category: "rushing" },
  { key: "rushing_tds", label: "Rushing Touchdowns", shortLabel: "Rush TDs", category: "rushing" },
  { key: "receiving_yards", label: "Receiving Yards", shortLabel: "Rec Yds", category: "receiving" },
  { key: "receptions", label: "Receptions", shortLabel: "Recs", category: "receiving" },
  { key: "targets", label: "Targets", shortLabel: "Targets", category: "receiving" },
  { key: "longest_reception", label: "Longest Reception", shortLabel: "Long Rec", category: "receiving" },
  { key: "receiving_tds", label: "Receiving Touchdowns", shortLabel: "Rec TDs", category: "receiving" },
  { key: "rush_plus_rec_yards", label: "Rush + Receiving Yards", shortLabel: "Rush+Rec", category: "combo" },
  { key: "qb_pass_plus_rush_yards", label: "QB Pass + Rush Yards", shortLabel: "QB Combo", category: "combo" },
  { key: "anytime_td", label: "Anytime Touchdown", shortLabel: "ATD", category: "scoring" },
  { key: "first_td", label: "First Touchdown", shortLabel: "1st TD", category: "scoring" },
  { key: "field_goals_made", label: "Field Goals Made", shortLabel: "FG Made", category: "kicking" },
  { key: "longest_field_goal", label: "Longest Field Goal", shortLabel: "Long FG", category: "kicking" },
  { key: "extra_points_made", label: "Extra Points Made", shortLabel: "XP Made", category: "kicking" },
  { key: "tackles_plus_assists", label: "Tackles + Assists", shortLabel: "T+A", category: "defense" },
  { key: "sacks", label: "Sacks", shortLabel: "Sacks", category: "defense" },
  { key: "interceptions", label: "Interceptions", shortLabel: "INT", category: "defense" },
];

export const NFL_PROP_CATEGORY_LABELS: Record<NflPropCategoryKey, string> = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  combo: "Combo",
  scoring: "Scoring",
  kicking: "Kicking",
  defense: "Defense",
};

export const NFL_MODEL_READINESS_TRACKS = [
  {
    title: "Roster Map",
    items: [
      "depth chart changes",
      "rookie landing spots",
      "usage splits by position group",
      "QB / OL / skill-player continuity",
    ],
  },
  {
    title: "Team Tactics",
    items: [
      "pass rate over expectation",
      "neutral pace",
      "red-zone tendency",
      "run funnel vs pass funnel matchup",
    ],
  },
  {
    title: "Player Context",
    items: [
      "route share and target share",
      "carry share and goal-line work",
      "air yards and depth of target",
      "injury and snap-count risk",
    ],
  },
] as const;
