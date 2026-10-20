# NBA Playoff Tracker

This file is the lightweight starting point for NBA learning.

## Scope

Use this tracker for:
- NBA playoff games
- high-attention late-season games only if we explicitly want to study them

Avoid mixing in:
- normal late-regular-season tank/rest chaos
- weird end-of-year lineups unless we intentionally label them

## What to log before tip

- `game_date`
- `round`
- `series`
- `series_game`
- `series_score_before`
- `closing_home_spread`
- `closing_total`
- `closing_home_ml`
- `closing_away_ml`
- `away_rest_days`
- `home_rest_days`
- `away_star_status`
- `home_star_status`
- `injury_context`
- `our_read`
- `official_pick`
- `official_line`
- `pick_bucket`
- `units_plan`

## What to log after the game

- `final_score`
- `ats_result`
- `total_result`
- `pick_result`
- `notes`

## Ground rules

1. Treat playoffs as a separate environment from the end of the regular season.
2. Track star availability in plain language: `active`, `probable`, `questionable`, `out`.
3. Note the series spot because Game 1, elimination games, and short-rest spots behave differently.
4. If a bet is conditional on injury news, write the condition in `official_pick` and explain it in `notes`.
5. If we pass a game, keep the row anyway. Passes still teach us something.

## First trends we want to test

- Does extra rest matter more in Game 1 than raw star power?
- Do injury-questionable underdogs get overpriced in the playoffs?
- Are giant playoff spreads still playable when one side has elite defense but shaky shot creation?
- Do Game 1 totals run lower when one team is on a one-day turnaround from Game 7?

## Current seed rows

The CSV starts with the two semifinal games on **May 4, 2026** so tonight becomes the first real checkpoint in the NBA dataset.
