# Codex Handoff: NBA / MLB Betting App

Last updated: 2026-04-17

Use this file when starting a new Codex thread. A good opening message is:

```text
Please read C:\Users\allsp\nba-betting-app\CODEX_HANDOFF.md first, then continue helping me with this betting app from there.
```

## Project Location

Main project folder:

```powershell
C:\Users\allsp\nba-betting-app
```

Run locally:

```powershell
cd C:\Users\allsp\nba-betting-app
npm run dev
```

Open the site at:

```text
http://localhost:3000
```

If port 3000 is already in use, Next.js may use 3001 instead.

## What This App Does

This started as an NBA betting dashboard and has been expanded into a full MLB model dashboard.

The MLB side now supports:

- Team markets: moneyline, run line, totals.
- Player props: pitcher strikeouts, batter hits, batter total bases.
- Top Picks, Best Value, and Free Picks sections.
- Calendar view with multi-select filters.
- Performance view with sport, market scope, star, Top Picks, Best Value, and Free Picks filters.
- Pick grading and historical performance tracking.
- MLB learning adjustments based on graded results.
- Game-start locking so picks do not change after the scheduled start time.
- A 5 AM ET betting-day cutoff, so late games stay attached to the prior betting day.

## User Preferences

The user wants practical help and code edits directly, not long theory first.

Important preferences:

- Make changes directly when the request is clear.
- Explain what changed in simple terms.
- Use exact commands when the user needs to run something.
- Keep betting picks locked once the game starts.
- Do not let live odds overwrite pregame picks.
- The goal is hit rate first, payout second.
- Free Picks should feel like the best public-facing picks.
- Best Value can be a little more aggressive.
- Top Picks should favor likely winners, not long-shot value.
- No pick should show `N/A` if pregame data existed somewhere else.
- Star ratings must be consistent everywhere the same pick appears.

## Secrets And Environment

Secrets live in:

```powershell
C:\Users\allsp\nba-betting-app\.env.local
```

Do not print or expose secret values in chat.

Important env concepts:

- `ODDS_API_KEY` powers sportsbook odds.
- Owner login values are in `.env.local`.
- `AUTO_SYNC_SECRET` protects local automation endpoints.
- Supabase env values power saved picks and history.

If API keys change, update `.env.local` and restart the dev server.

## Main Files

High-traffic app files:

- `app/mlb/page.tsx`: main MLB dashboard, sync buttons, Free Picks, Top Picks, Best Value, game cards.
- `app/calendar/page.tsx`: calendar display and filters.
- `app/performance/page.tsx`: performance metrics and filters.
- `app/components/PerformanceRangeSelect.tsx`: performance filter controls.
- `app/api/picks/route.ts`: fetches saved picks, dedupes rows, applies MLB betting-day normalization.
- `app/api/grade-picks/route.ts`: grades pending picks.
- `app/api/sync-mlb-odds/route.ts`: syncs MLB team odds and game model.
- `app/api/sync-mlb-top-picks/route.ts`: creates team Top Picks and Best Value.
- `app/api/sync-mlb-props/route.ts`: syncs player props for one game.
- `app/api/sync-mlb-props-slate/route.ts`: syncs player props for the full MLB slate.
- `app/api/auto-sync/route.ts`: endpoint used by local scheduled automation.

Core model files:

- `lib/mlbModel.ts`: MLB game evaluation, starters, team ratings, context.
- `lib/mlbPickRanking.ts`: team pick ranking, bet eligibility, Top Pick vs Best Value logic.
- `lib/mlbPropModel.ts`: player prop model, expected playing time, recent trends, market health.
- `lib/mlbLearning.ts`: learning from graded picks, outlier handling, extra-inning dampening.
- `lib/starRatings.ts`: star rating logic for teams and props.

Automation files:

- `scripts/run-auto-sync.ps1`: starts local app if needed and calls auto-sync.
- `scripts/install-local-automation.ps1`: installs Windows scheduled tasks.

## Current Product Rules

Betting day:

- MLB betting day rolls over at 5:00 AM ET.
- A game starting after midnight but before 5:00 AM should still belong to the previous betting day.

Locking:

- Once a game reaches its scheduled start time, picks are locked.
- Syncing or grading must not change odds, edge, star rating, side, or payout for started games.
- Started and finished games should still display for that betting day.

Team picks:

- Top Picks should favor hit rate and decent payout.
- Best Value should favor pricing mistakes but must still be supported by the projection.
- Do not pick a moneyline side projected to lose just because the payout is big.
- Run line picks should consider projected margin, payout, and historical run-line performance.

Player props:

- Props use their own star scale.
- Pitcher strikeout props need workload/innings expectation.
- Batter props need lineup/playing-time confidence.
- Props should learn by market type, not just overall.

Free Picks:

- Free Picks replaced the old "Locks" name.
- They are the best 3 from team/prop Top Picks and Best Value.
- Must have payout of at least 0.63u.
- Should avoid weak/cold/watch-flag picks.
- Performance view tracks Free Picks separately.

Star ratings:

- 5 Stars should represent strongest expected hit rate.
- 4 Stars are next strongest.
- 1 Star is still a trackable pick, but low confidence.
- The same pick must have the same star value everywhere.

## Recent Completed Work

Recent changes already made:

- Added permanent MLB sync controls back to the MLB page.
- Made Top Picks and Best Value columns symmetrical.
- Renamed Locks to Free Picks.
- Added Free Picks tracking to Performance.
- Added local automation endpoint and PowerShell scripts.
- Installed local Windows scheduled tasks.

Scheduled tasks created:

- `Betting Lab - Grade Picks 2AM`
- `Betting Lab - Sync MLB Slate 6AM`

Automation caveats:

- The PC must be on and awake.
- Internet must be working.
- API credits and keys must be valid.
- The local app must be able to run on port 3000.
- This is local automation, not cloud hosting.

## Validation Notes

Recent build status:

- `npm run build` passed after recent app/API changes.
- Targeted lint passed for the recently changed MLB and performance files.

Known caveat:

- Full lint may still show older unrelated issues in old dashboard/NBA files.

## Known Things To Watch

The user has been concerned about:

- Top Picks not hitting enough.
- 5 Star picks underperforming.
- Team run line picks becoming too common.
- Player prop stars not matching actual confidence.
- Finished games not grading or disappearing incorrectly.
- MLB tab and Calendar showing different star values for the same pick.
- Picks being overwritten by sync after games start.
- Odds/payout/results being counted once and on the correct betting day.

When changing model logic, preserve locked historical picks unless the user explicitly asks to repair old rows.

## Suggested Next Improvements

Best next improvements:

- Strengthen player prop workload modeling, especially pitcher innings expectations.
- Add lineup confirmation and batting-order confidence to batter props.
- Add pitcher leash/team bullpen context.
- Add rolling calibration tables so 5 Star, 4 Star, etc. are based on actual hit rates.
- Add a model audit panel showing why each pick got its star rating.
- Add a daily reconciliation check for duplicate picks, wrong dates, and unsettled finished games.
- Add stricter tests around 5 AM betting-day logic and game-start locking.

## New Thread Reminder

In a new Codex thread, start with:

```text
Please read C:\Users\allsp\nba-betting-app\CODEX_HANDOFF.md first, then continue helping me with this betting app from there.
```

Then ask for the next change normally.
