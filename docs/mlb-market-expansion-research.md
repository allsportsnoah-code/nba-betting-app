# MLB Market Expansion Research

## Scope

These are the four expansion areas we want to learn without rushing them onto the public board:

- Team totals: `team_totals`
- Pitcher outs recorded: `pitcher_outs`
- Batter run production: `batter_rbis`, `batter_runs_scored`, `batter_hits_runs_rbis`
- First 5 innings: `h2h_1st_5_innings`, `spreads_1st_5_innings`, `totals_1st_5_innings`

The Odds API lists team totals as an additional event market, first-5 baseball markets as game-period markets, and the new MLB player props above as event-level player prop markets:

- https://the-odds-api.com/sports-odds-data/betting-markets.html

## Data Notes

- Pitcher outs are scored from innings pitched. MLB defines each recorded out as one third of an inning, so `5.2 IP` equals 17 outs.
- Pitcher outs should care more about workload than strikeout props do: projected IP, pitch count, batters faced, recent pitch-count swing, and manager leash.
- Batter run production should start with projected plate appearances, because MLB defines a PA as every completed turn batting. More PA creates more chances for hits, runs, and RBIs.
- RBIs are context heavy. MLB credits RBIs when a PA causes a run to score, with exceptions, so lineup slot, team implied total, and base-runner environment matter more than raw hitter talent alone.
- Statcast and Baseball Savant should be used as process checks, not blind picks. MLB notes that expected stats use exit velocity, launch angle, sprint speed, and comparable batted balls, which can help separate skill from noisy outcomes.

References:

- https://www.mlb.com/glossary/standard-stats/innings-pitched
- https://www.mlb.com/glossary/advanced-stats/pitches-per-start
- https://www.mlb.com/glossary/standard-stats/plate-appearance
- https://www.mlb.com/glossary/standard-stats/runs-batted-in
- https://www.mlb.com/glossary/statcast

## Rolling Windows

Use four windows for every new market:

- Last year: baseline skill and role stability.
- Last 2 months: current-season role and team environment.
- Last 30 days: recent form and lineup/rotation changes.
- Last 7 days: sharp context, but low trust unless it confirms the larger windows.

Initial blend:

- Stable skills: 35% last year, 25% last 2 months, 25% last 30 days, 15% last week.
- Role/workload markets: 25% last year, 30% last 2 months, 25% last 30 days, 20% last week.
- Volatile run-production props: 30% last year, 25% last 2 months, 25% last 30 days, 20% last week, with a cap so one hot week cannot force a 5-star grade.

## Market Strategy

### Team Totals

Start from implied team runs, then adjust with:

- Team offense and opponent run-prevention learning.
- Opposing starter quality and starter handedness.
- Bullpen fatigue and recent bullpen usage.
- Park/weather run environment.
- Lineup injury and rest flags.

Guardrail:

- Do not make this public until grading can score the selected team run total directly.
- Early board cap should be 4 stars until at least 35 settled shadow samples.

### Pitcher Outs

Projection stack:

- Season IP/start and recent IP/start.
- Pitch count per start, recent pitch count, and pitch-count volatility.
- Batters faced, pitches per batter, and times through the order.
- Opponent patience and contact profile.
- Injury/return-from-IL and short-rest flags.

Guardrail:

- Overs need stable leash, not just a high projected line.
- Any recent pitch-count dip or projected under 5.2 IP should cap aggressive overs.
- Start shadow-only until 18 settled samples, then max 4 stars until 35.

### Batter RBIs / Runs / H+R+RBI

Projection stack:

- Expected PA from lineup slot and confirmed/likely lineup.
- Per-PA rate for the stat over each rolling window.
- Team implied total and batting order context.
- Batter process stats: xBA/xSLG/xwOBA, hard-hit/barrel trend, sprint speed for runs.
- Opposing pitcher handedness and bullpen weakness.

Guardrail:

- RBIs and runs are more context-dependent than hits, so avoid 5-star picks until the market proves itself.
- Prefer top-4 lineup spots for overs.
- Treat H+R+RBI as more stable than RBI-only, but still cap early because it can be inflated by one spike game.

### First 5 Innings

Projection stack:

- Starter-vs-starter run projection.
- First two lineup turns, opponent starter splits, and pitcher fatigue/leash.
- Early-game team scoring rates over the four windows.
- Weather/park, but with less bullpen impact than full game markets.

Guardrail:

- Needs first-five grading from inning linescore before public board use.
- F5 totals are starter-heavy; F5 sides need stronger starting-pitcher edge than full-game run lines.

## Current Implementation Status

- Ready in shadow player-prop pipeline: `pitcher_outs`, `batter_rbis`, `batter_runs_scored`, `batter_hits_runs_rbis`.
- Ready in shadow odds fetch/grading pipeline: `team_totals`, `h2h_1st_5_innings`, `spreads_1st_5_innings`, `totals_1st_5_innings`.
- Shadow markets are gated behind `includeShadowMarkets=1` so normal syncs do not spend extra API credits.
- Added grading support for the four new player-prop stat keys.
- Added grading support for `team_total`, `f5_moneyline`, `f5_spread`, and `f5_total`.
- Added learning health for new prop markets with a shadow cap: max 2 stars before 18 settled picks, max 4 stars before 35 settled picks.
- Not public-board live yet for team totals and first-5 markets. Those still need candidate ranking and board-selection rules before board eligibility.
