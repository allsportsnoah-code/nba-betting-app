// Daily NBA 25-leg longshot ticket + top single picks.
//
//   node scripts/build-nba-parlays.mjs [--dates 2026-10-20,2026-10-21] [--legs 25]
//        [--stake 0.2] [--target 1000000]
//
// Lines: FanDuel first (its free public sportsbook JSON); DraftKings via ESPN's free odds feed
// fills only the markets/players FanDuel hasn't posted. Each leg saves its `book`.
// --dry-run builds and prints without writing anything.
// Hit chance per leg = market no-vig probability, nudged by our own projection:
//   player props -> 2025-26 per-game averages (Basketball-Reference)
//   spreads/moneylines -> data/nba/power-ratings (+ home court from model-params)
//   totals -> market only (the totals edge was noise in the backtest)
// Ticket: highest hit chance first, one leg per player, a per-game cap, then the
// smallest tilt toward price that gets the FanDuel-adjusted payout to the target.
//
// Also per day (data/picks/nba-sets-<date>.json): one best pick per game as a small parlay,
// and 5-10 drifting 5-6 leg tickets for each game (normal lines, with up to two legs
// lowered to an alt line when that adds real hit chance).
//
// Saved to data/picks/nba-parlays-<date>.json. Saved tickets are left alone unless
// --rebuild is passed, and never once their game has tipped; a rebuild keeps every
// earlier version in `history` and in data/picks/backups/.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const ROOT = process.cwd();
const REBUILD = args.includes("--rebuild"); // 25-leg ticket and sets
const REBUILD_SETS = REBUILD || args.includes("--rebuild-sets");
const DRY_RUN = args.includes("--dry-run"); // build and print, write nothing
const NBA_DIR = path.join(ROOT, "data", "nba");
const PICKS_DIR = path.join(ROOT, "data", "picks");
const SNAP_DIR = path.join(ROOT, "data", "snapshots", "nba");
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const DK = 100;

const CONFIG = {
  legs: Number(argValue("--legs") ?? 25),
  stake: Number(argValue("--stake") ?? 0.2),
  targetPayout: Number(argValue("--target") ?? 1_000_000),
  minPrice: -135,
  maxPrice: 150,
  // Weight on our projection vs the market's no-vig probability.
  propModelWeight: 0.25,
  sideModelWeight: 0.2,
  milestoneVig: 0.92, // one-sided alt ladders carry ~8% hold
  minGamesForModel: 15,
  // Our estimate of how far FanDuel's real parlay price sits below the plain product, by the
  // most legs we stack in one game (from the NFL Week 6 quotes; NBA is unmeasured).
  fanduelHaircut: [
    { maxPerGame: 1, factor: 1.15 },
    { maxPerGame: 2, factor: 3.5 },
    { maxPerGame: 4, factor: 5 },
    { maxPerGame: Infinity, factor: 7.6 },
  ],
  topPickFloor: 0.55, // hit-rate-over-EV rule for singles
  topPickMinEv: -0.02,
};

// ---------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

async function getJson(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await sleep(800 * attempt);
  }
  return null;
}

function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
const implied = (american) => (american < 0 ? -american / (-american + 100) : 100 / (american + 100));
const decimal = (american) => (american < 0 ? 1 + 100 / -american : 1 + american / 100);
const fmtPrice = (american) => (american > 0 ? `+${american}` : `${american}`);

function easternDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date);
}
function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.',]/g, "")
    .replace(/-/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const NAME_ALIASES = { "ronald holland": "ron holland" };
const matchKey = (name) => NAME_ALIASES[normalizeName(name)] ?? normalizeName(name);

// ---- 2025-26 per-game stats (Basketball-Reference, cached) --------------------------------
const PER_GAME_FILE = path.join(NBA_DIR, "player-per-game-2025-26.json");

function parseTable(html, tableId) {
  const uncommented = html.replace(/<!--|-->/g, "");
  const start = uncommented.indexOf(`id="${tableId}"`);
  if (start < 0) throw new Error(`table ${tableId} not found`);
  const end = uncommented.indexOf("</table>", start);
  const body = uncommented.slice(uncommented.indexOf("<tbody", start), end);
  const rows = [];
  for (const rowMatch of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = {};
    for (const cell of rowMatch[1].matchAll(/<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g)) {
      row[cell[1]] = cell[2].replace(/<[^>]*>/g, "").trim();
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

async function loadPerGame() {
  if (fs.existsSync(PER_GAME_FILE) && !args.includes("--refresh")) return readJson(PER_GAME_FILE);
  console.log("Fetching Basketball-Reference 2025-26 per-game stats...");
  const res = await fetch("https://www.basketball-reference.com/leagues/NBA_2026_per_game.html", {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36" },
  });
  if (!res.ok) throw new Error(`bref per_game HTTP ${res.status}`);
  const players = {};
  for (const row of parseTable(await res.text(), "per_game_stats")) {
    if (!row.name_display || row.name_display === "League Average") continue;
    const key = matchKey(row.name_display.replace(/\*$/, ""));
    // Traded players: the first row is the season total (2TM/3TM), keep it.
    if (players[key]) continue;
    const n = (stat) => Number(row[stat]) || 0;
    players[key] = {
      name: row.name_display.replace(/\*$/, ""),
      games: n("games"),
      mpg: n("mp_per_g"),
      pts: n("pts_per_g"),
      reb: n("trb_per_g"),
      ast: n("ast_per_g"),
      fg3: n("fg3_per_g"),
      stl: n("stl_per_g"),
      blk: n("blk_per_g"),
    };
  }
  const out = { season: "2025-26", source: "Basketball-Reference per-game", fetchedAt: new Date().toISOString(), players };
  fs.writeFileSync(PER_GAME_FILE, JSON.stringify(out) + "\n");
  return out;
}

// ---- Projection distributions ------------------------------------------------------------
// Negative-binomial style spread: var = mean + mean^2 / k.
const STAT_K = { pts: 8, reb: 10, ast: 8, fg3: 15, stl: 40, blk: 25 };
const MARKETS = {
  "Total Points": ["pts"],
  "Total Rebounds": ["reb"],
  "Total Assists": ["ast"],
  "Total 3-Point Field Goals": ["fg3"],
  "Total Steals": ["stl"],
  "Total Blocks": ["blk"],
  "Total Points and Assists": ["pts", "ast"],
  "Total Points and Rebounds": ["pts", "reb"],
  "Total Assists and Rebounds": ["ast", "reb"],
  "Total Points, Rebounds, and Assists": ["pts", "reb", "ast"],
};
const MILESTONES = {
  "Points Milestones": ["pts"],
  "Rebounds Milestones": ["reb"],
  "Assists Milestones": ["ast"],
  "3-Point Field Goals Milestones": ["fg3"],
  "Points + Assists + Rebounds Milestones": ["pts", "reb", "ast"],
  "Points + Assists Milestones": ["pts", "ast"],
  "Points + Rebounds Milestones": ["pts", "reb"],
  "Rebounds + Assists Milestones": ["ast", "reb"],
};
const STAT_LABEL = { pts: "Pts", reb: "Reb", ast: "Ast", fg3: "3PM", stl: "Stl", blk: "Blk" };

function projection(stats, parts) {
  if (!stats || stats.games < CONFIG.minGamesForModel) return null;
  const mean = parts.reduce((sum, stat) => sum + stats[stat], 0);
  const variance = parts.reduce((sum, stat) => sum + stats[stat] + stats[stat] ** 2 / STAT_K[stat], 0) * (parts.length > 1 ? 1.25 : 1);
  return { mean, sd: Math.max(0.6, Math.sqrt(variance)) };
}
// Last season's averages miss role changes (new team, bigger minutes). When the book's line sits
// far from our mean, trust the book: full weight within 0.5 sd, none beyond 1.5 sd.
function modelWeight(base, proj, line) {
  if (!proj) return 0;
  const gap = Math.abs(line - proj.mean) / proj.sd;
  return base * clamp(1.5 - gap, 0, 1);
}

// P(stat >= threshold) for an integer threshold.
const pAtLeast = (proj, threshold) => 1 - normCdf((threshold - 0.5 - proj.mean) / proj.sd);

// ---- ESPN pulls ------------------------------------------------------------------------
async function fetchSlate(date) {
  const board = await getJson(`${SCOREBOARD}?dates=${date.replace(/-/g, "")}`);
  return (board?.events ?? []).map((event) => {
    const comp = event.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home").team;
    const away = comp.competitors.find((c) => c.homeAway === "away").team;
    return {
      id: event.id,
      startTime: event.date,
      status: comp.status?.type?.name ?? event.status?.type?.name,
      home: home.abbreviation,
      away: away.abbreviation,
      homeName: home.displayName,
      awayName: away.displayName,
      label: `${away.abbreviation} @ ${home.abbreviation}`,
    };
  });
}

async function fetchGameLines(game) {
  const odds = await getJson(`${CORE}/events/${game.id}/competitions/${game.id}/odds`);
  const dk = odds?.items?.find((item) => Number(item.provider?.id) === DK);
  if (!dk) return null;
  const num = (value) => (value == null || value === "" ? null : Number(value));
  return {
    homeSpread: num(dk.spread),
    homeSpreadPrice: num(dk.homeTeamOdds?.spreadOdds),
    awaySpreadPrice: num(dk.awayTeamOdds?.spreadOdds),
    total: num(dk.overUnder),
    overPrice: num(dk.overOdds),
    underPrice: num(dk.underOdds),
    homeMl: num(dk.homeTeamOdds?.moneyLine),
    awayMl: num(dk.awayTeamOdds?.moneyLine),
  };
}

async function fetchPropBets(game) {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const res = await getJson(`${CORE}/events/${game.id}/competitions/${game.id}/odds/${DK}/propBets?limit=1000&page=${page}`);
    items.push(...(res?.items ?? []));
    if (!res || page >= (res.pageCount ?? 1)) break;
  }
  return items;
}

// ---- FanDuel pulls (free public sportsbook JSON) -----------------------------------------
// FanDuel first; DraftKings (ESPN) only fills markets/players FanDuel hasn't posted.
// FanDuel markets are converted to ESPN's shape so the leg math below stays the same.
const FD_API = "https://sbapi.nj.sportsbook.fanduel.com/api";
const FD_KEY = "FhMFpcPWXMeyZxOx"; // FanDuel's public web app key
const FD_TABS = ["", "player-points", "player-rebounds", "player-assists", "player-threes", "player-combos"];
const FD_MAIN = {
  POINTS: "Total Points",
  REBOUNDS: "Total Rebounds",
  ASSISTS: "Total Assists",
  MADE_3_POINT_FIELD_GOALS: "Total 3-Point Field Goals",
  "POINTS_+_ASSISTS": "Total Points and Assists",
  "POINTS_+_REBOUNDS": "Total Points and Rebounds",
  "REBOUNDS_+_ASSISTS": "Total Assists and Rebounds",
  "POINTS_+_REB_+_AST": "Total Points, Rebounds, and Assists",
};
const FD_LADDER = {
  POINTS: "Points Milestones",
  REBOUNDS: "Rebounds Milestones",
  ASSISTS: "Assists Milestones",
  MADE_THREES: "3-Point Field Goals Milestones",
  "PTS_+_REB_+_AST": "Points + Assists + Rebounds Milestones",
  "PTS_+_AST": "Points + Assists Milestones",
  "PTS_+_REB": "Points + Rebounds Milestones",
  "REB_+_AST": "Rebounds + Assists Milestones",
};

async function fdJson(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await sleep(800 * attempt);
  }
  return null;
}

const nickname = (team) => String(team).trim().split(/\s+/).pop().toLowerCase();

let fdEventsCache = null;
async function fetchFanDuelEvents() {
  if (fdEventsCache) return fdEventsCache;
  const page = await fdJson(`${FD_API}/content-managed-page?page=CUSTOM&customPageId=nba&_ak=${FD_KEY}&timezone=America/New_York`);
  fdEventsCache = Object.values(page?.attachments?.events ?? {})
    .filter((event) => / @ /.test(event.name))
    .map((event) => {
      const [away, home] = event.name.split(" @ ");
      return { eventId: event.eventId, away: nickname(away), home: nickname(home), openDate: event.openDate };
    });
  if (!page) console.log("FanDuel: could not load the NBA page, using DraftKings lines only");
  return fdEventsCache;
}

/** FanDuel game lines + player props for one game, in ESPN's shapes; null when FanDuel hasn't listed it. */
async function fetchFanDuelGame(game, index) {
  const events = await fetchFanDuelEvents();
  const tip = new Date(game.startTime).getTime();
  const event = events.find(
    (e) => e.home === nickname(game.homeName) && e.away === nickname(game.awayName) && Math.abs(new Date(e.openDate).getTime() - tip) < 12 * 3600e3,
  );
  if (!event) return null;
  const markets = new Map();
  for (const tab of FD_TABS) {
    const res = await fdJson(`${FD_API}/event-page?_ak=${FD_KEY}&eventId=${event.eventId}${tab ? `&tab=${tab}` : ""}`);
    for (const market of Object.values(res?.attachments?.markets ?? {})) {
      if (market.marketStatus === "OPEN" && !market.inPlay) markets.set(market.marketId, market);
    }
  }
  if (!markets.size) return null;

  const price = (runner) => Number(runner?.winRunnerOdds?.americanDisplayOdds?.americanOddsInt);
  const active = (market) => (market.runners ?? []).filter((r) => r.runnerStatus === "ACTIVE" && Number.isFinite(price(r)));
  const one = (type) => [...markets.values()].find((m) => m.marketType === type);

  // Game lines (home/away from FanDuel's runner result type).
  const lines = {};
  const ml = one("MONEY_LINE");
  const spread = one("MATCH_HANDICAP_(2-WAY)");
  const total = one("TOTAL_POINTS_(OVER/UNDER)");
  const side = (market, type) => active(market ?? {}).find((r) => r.result?.type === type);
  if (side(ml, "HOME") && side(ml, "AWAY")) Object.assign(lines, { homeMl: price(side(ml, "HOME")), awayMl: price(side(ml, "AWAY")) });
  if (side(spread, "HOME") && side(spread, "AWAY")) {
    Object.assign(lines, { homeSpread: side(spread, "HOME").handicap, homeSpreadPrice: price(side(spread, "HOME")), awaySpreadPrice: price(side(spread, "AWAY")) });
  }
  if (side(total, "OVER") && side(total, "UNDER")) Object.assign(lines, { total: side(total, "OVER").handicap, overPrice: price(side(total, "OVER")), underPrice: price(side(total, "UNDER")) });

  // ESPN athlete id for a FanDuel name, preferring this game's two rosters.
  const teams = new Set([game.home, game.away]);
  const idOf = (name) => {
    const key = matchKey(name);
    const hits = Object.entries(index.names).filter(([, n]) => matchKey(n) === key).map(([id]) => id);
    const exact = hits.find((id) => teams.has(index.teamOf[id])) ?? hits[0];
    if (exact) return exact;
    // Ladders sometimes abbreviate ("N Alexander-Walker"): first initial + last name, this game's rosters only.
    const short = key.match(/^([a-z]) (.+)$/);
    if (!short) return null;
    const rostered = Object.entries(index.names).filter(([id, n]) => {
      const k = matchKey(n);
      return teams.has(index.teamOf[id]) && k.startsWith(short[1]) && k.endsWith(` ${short[2]}`);
    });
    return rostered.length === 1 ? rostered[0][0] : null;
  };
  const item = (typeName, athlete, value, american) => ({
    type: { name: typeName },
    athlete: { $ref: `athletes/${athlete}` },
    current: { target: { value } },
    odds: { american: { value: american } },
    lastUpdated: "fanduel",
    book: "fanduel",
  });
  const items = [];
  const unmatched = new Set();
  for (const market of markets.values()) {
    const main = market.marketType.match(/^PLAYER_[A-Z]+_TOTAL_(.+)$/);
    if (main && FD_MAIN[main[1]]) {
      const runners = active(market);
      const over = runners.find((r) => r.result?.type === "OVER");
      const under = runners.find((r) => r.result?.type === "UNDER");
      const player = String(market.marketName).split(" - ")[0];
      const athlete = idOf(player);
      if (!athlete) unmatched.add(player);
      // Over first, then under (the order propLegs expects).
      if (athlete && over && under && over.handicap === under.handicap) {
        items.push(item(FD_MAIN[main[1]], athlete, over.handicap, price(over)), item(FD_MAIN[main[1]], athlete, under.handicap, price(under)));
      }
      continue;
    }
    const ladder =
      market.marketType.match(/^TO_SCORE_(\d+)\+_(POINTS)$/) ??
      market.marketType.match(/^TO_RECORD_(\d+)\+_(REBOUNDS|ASSISTS|PTS_\+_REB_\+_AST|PTS_\+_AST|PTS_\+_REB|REB_\+_AST)$/) ??
      market.marketType.match(/^(\d+)\+_(MADE_THREES)$/);
    if (ladder && FD_LADDER[ladder[2]]) {
      for (const runner of active(market)) {
        const athlete = idOf(runner.runnerName);
        if (!athlete) unmatched.add(runner.runnerName);
        else items.push(item(FD_LADDER[ladder[2]], athlete, Number(ladder[1]), price(runner)));
      }
    }
  }
  return { lines, items, unmatched: [...unmatched] };
}

/** FanDuel where posted, DraftKings for whatever FanDuel lacks (per market, per player). */
function mergeBooks(fd, dkLines, dkItems) {
  const LINE_GROUPS = [
    ["ml", ["homeMl", "awayMl"]],
    ["spread", ["homeSpread", "homeSpreadPrice", "awaySpreadPrice"]],
    ["total", ["total", "overPrice", "underPrice"]],
  ];
  const lines = { books: {} };
  for (const [group, fields] of LINE_GROUPS) {
    const from = fd?.lines && fields.every((f) => fd.lines[f] != null) ? fd.lines : dkLines && fields.every((f) => dkLines[f] != null) ? dkLines : null;
    if (!from) continue;
    for (const f of fields) lines[f] = from[f];
    lines.books[group] = from === fd?.lines ? "fanduel" : "draftkings";
  }
  const athleteOf = (item) => item.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1];
  const covered = new Set((fd?.items ?? []).map((item) => `${athleteOf(item)}|${item.type.name}`));
  const items = [...(fd?.items ?? []), ...dkItems.filter((item) => !covered.has(`${athleteOf(item)}|${item.type?.name}`)).map((item) => ({ ...item, book: "draftkings" }))];
  return { lines: Object.keys(lines.books).length ? lines : null, items };
}

const bookSource = (pool) => {
  const fd = pool.filter((leg) => leg.book === "fanduel").length;
  if (fd === pool.length) return "FanDuel lines";
  if (!fd) return "DraftKings lines via ESPN (FanDuel not posted; check FanDuel, lines can differ slightly)";
  return `FanDuel lines, DraftKings via ESPN where FanDuel had none (${pool.length - fd} of ${pool.length} lines; check those on FanDuel)`;
};

// ---- Leg pool ----------------------------------------------------------------------------
function buildNameIndex() {
  const names = {};
  const teamOf = {};
  const rosters = readJson(path.join(NBA_DIR, "rosters-2026-27.json"));
  for (const [abbr, team] of Object.entries(rosters.teams)) {
    for (const player of team.players) {
      names[player.espnId] = player.name;
      teamOf[player.espnId] = abbr;
    }
  }
  for (const file of ["games-2026-27.json", "games-2025-26.json"]) {
    const fileNames = readJson(path.join(NBA_DIR, file)).playerNames ?? {};
    for (const [id, name] of Object.entries(fileNames)) names[id] ??= name;
  }
  return { names, teamOf };
}

async function resolveNames(ids, index) {
  const missing = [...new Set(ids)].filter((id) => !index.names[id]);
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const found = await Promise.all(batch.map((id) => getJson(`${CORE}/seasons/2027/athletes/${id}`, 1)));
    batch.forEach((id, j) => {
      if (found[j]?.displayName) index.names[id] = found[j].displayName;
    });
  }
}

function sideLegs(game, lines, ratings, hca) {
  if (!lines) return [];
  const legs = [];
  const home = ratings?.teams?.[game.home];
  const away = ratings?.teams?.[game.away];
  const modelMargin = home && away ? home.rating - away.rating + hca : null;
  const sd = 13.86;
  const base = { gameId: game.id, game: game.label, startTime: game.startTime, kind: "game" };

  const twoWay = (pa, pb) => {
    const a = implied(pa);
    const b = implied(pb);
    return [a / (a + b), b / (a + b)];
  };

  if (lines.homeSpread != null && lines.homeSpreadPrice != null && lines.awaySpreadPrice != null) {
    const [mh, ma] = twoWay(lines.homeSpreadPrice, lines.awaySpreadPrice);
    const modelHome = modelMargin == null ? null : 1 - normCdf((-lines.homeSpread - modelMargin) / sd);
    const w = modelMargin == null ? 0 : CONFIG.sideModelWeight;
    const spreadText = (team, spread) => `${team} ${spread > 0 ? "+" : ""}${spread}`;
    legs.push({ ...base, key: `${game.id}|spread`, market: "Spread", pick: spreadText(game.home, lines.homeSpread), price: lines.homeSpreadPrice, marketProb: mh, modelProb: modelHome, hitProb: (1 - w) * mh + w * (modelHome ?? mh) });
    legs.push({ ...base, key: `${game.id}|spread`, market: "Spread", pick: spreadText(game.away, -lines.homeSpread), price: lines.awaySpreadPrice, marketProb: ma, modelProb: modelHome == null ? null : 1 - modelHome, hitProb: (1 - w) * ma + w * (modelHome == null ? ma : 1 - modelHome) });
  }
  if (lines.homeMl != null && lines.awayMl != null) {
    const [mh, ma] = twoWay(lines.homeMl, lines.awayMl);
    const modelHome = modelMargin == null ? null : 1 - normCdf(-modelMargin / sd);
    const w = modelMargin == null ? 0 : CONFIG.sideModelWeight;
    legs.push({ ...base, key: `${game.id}|ml`, market: "Moneyline", pick: `${game.home} ML`, price: lines.homeMl, marketProb: mh, modelProb: modelHome, hitProb: (1 - w) * mh + w * (modelHome ?? mh) });
    legs.push({ ...base, key: `${game.id}|ml`, market: "Moneyline", pick: `${game.away} ML`, price: lines.awayMl, marketProb: ma, modelProb: modelHome == null ? null : 1 - modelHome, hitProb: (1 - w) * ma + w * (modelHome == null ? ma : 1 - modelHome) });
  }
  if (lines.total != null && lines.overPrice != null && lines.underPrice != null) {
    const [mo, mu] = twoWay(lines.overPrice, lines.underPrice);
    legs.push({ ...base, key: `${game.id}|total`, market: "Total", pick: `Over ${lines.total}`, price: lines.overPrice, marketProb: mo, modelProb: null, hitProb: mo });
    legs.push({ ...base, key: `${game.id}|total`, market: "Total", pick: `Under ${lines.total}`, price: lines.underPrice, marketProb: mu, modelProb: null, hitProb: mu });
  }
  // Spread and moneyline on the same team are near-duplicates; treat them as one slot.
  for (const leg of legs) if (leg.market !== "Total") leg.slot = `${game.id}|side`;
  for (const leg of legs) leg.book = lines.books?.[leg.key.split("|")[1]] ?? "draftkings";
  return legs;
}

function propLegs(game, items, index, perGame) {
  const athleteOf = (item) => item.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1];
  const legs = [];
  const base = { gameId: game.id, game: game.label, startTime: game.startTime, kind: "prop" };

  // Two-sided main lines: ESPN lists the over first, then the under.
  const pairs = new Map();
  for (const item of items) {
    const parts = MARKETS[item.type?.name];
    const athlete = athleteOf(item);
    const line = item.current?.target?.value;
    const price = Number(item.odds?.american?.value);
    if (!parts || !athlete || line == null || !Number.isFinite(price)) continue;
    const key = `${athlete}|${item.type.name}|${line}`;
    const pair = pairs.get(key) ?? { athlete, market: item.type.name, parts, line, prices: [], book: item.book ?? "draftkings" };
    pair.prices.push(price);
    pairs.set(key, pair);
  }
  for (const pair of pairs.values()) {
    if (pair.prices.length !== 2) continue;
    const name = index.names[pair.athlete];
    if (!name) continue;
    const [over, under] = pair.prices;
    const pOver = implied(over) / (implied(over) + implied(under));
    const proj = projection(perGame.players[matchKey(name)], pair.parts);
    const modelOver = proj ? 1 - normCdf((pair.line - proj.mean) / proj.sd) : null;
    const w = modelWeight(CONFIG.propModelWeight, proj, pair.line);
    const label = pair.parts.map((stat) => STAT_LABEL[stat]).join("+");
    const team = index.teamOf[pair.athlete] ?? null;
    const common = { ...base, book: pair.book, player: name, playerId: pair.athlete, team, market: label, line: pair.line, projection: proj ? round(proj.mean, 1) : null, slot: `player|${pair.athlete}` };
    legs.push({ ...common, key: `${pair.athlete}|${label}|o${pair.line}`, pick: `${name} Over ${pair.line} ${label}`, side: "over", price: over, marketProb: pOver, modelProb: modelOver, hitProb: (1 - w) * pOver + w * (modelOver ?? pOver) });
    legs.push({ ...common, key: `${pair.athlete}|${label}|u${pair.line}`, pick: `${name} Under ${pair.line} ${label}`, side: "under", price: under, marketProb: 1 - pOver, modelProb: modelOver == null ? null : 1 - modelOver, hitProb: (1 - w) * (1 - pOver) + w * (modelOver == null ? 1 - pOver : 1 - modelOver) });
  }

  // Alt ladders ("8+ points"): overs only, used to buy price when the payout needs it.
  // ESPN mixes first-quarter ladders in under the same market name, so keep only the ladder
  // whose rung at the main line prices like the main-line over.
  const mainOver = new Map();
  for (const pair of pairs.values()) {
    if (pair.prices.length === 2) mainOver.set(`${pair.athlete}|${pair.parts.join("+")}`, { line: pair.line, price: pair.prices[0] });
  }
  const ladders = new Map();
  for (const item of items) {
    const parts = MILESTONES[item.type?.name];
    const athlete = athleteOf(item);
    if (!parts || !athlete) continue;
    const key = `${athlete}|${parts.join("+")}|${item.lastUpdated}`;
    ladders.set(key, [...(ladders.get(key) ?? []), item]);
  }
  const keptLadders = new Map();
  for (const [key, rungs] of ladders) {
    const [athlete, statKey] = key.split("|");
    const main = mainOver.get(`${athlete}|${statKey}`);
    if (!main) continue;
    const rung = rungs.find((item) => item.current?.target?.value === Math.ceil(main.line));
    if (!rung) continue;
    const gap = Math.abs(implied(Number(rung.odds?.american?.value)) - implied(main.price));
    const best = keptLadders.get(`${athlete}|${statKey}`);
    if (gap <= 0.08 && (!best || gap < best.gap)) keptLadders.set(`${athlete}|${statKey}`, { gap, rungs });
  }
  for (const item of [...keptLadders.values()].flatMap((ladder) => ladder.rungs)) {
    const parts = MILESTONES[item.type?.name];
    const athlete = athleteOf(item);
    const threshold = item.current?.target?.value;
    const price = Number(item.odds?.american?.value);
    if (threshold == null || !Number.isFinite(price)) continue;
    const name = index.names[athlete];
    if (!name) continue;
    const marketProb = implied(price) * CONFIG.milestoneVig;
    const proj = projection(perGame.players[matchKey(name)], parts);
    const modelProb = proj ? pAtLeast(proj, threshold) : null;
    const w = modelWeight(CONFIG.propModelWeight, proj, threshold - 0.5);
    const label = parts.map((stat) => STAT_LABEL[stat]).join("+");
    legs.push({
      ...base,
      book: item.book ?? "draftkings",
      key: `${athlete}|${label}|${threshold}+`,
      slot: `player|${athlete}`,
      player: name,
      playerId: athlete,
      team: index.teamOf[athlete] ?? null,
      market: `${label} (alt)`,
      line: threshold,
      side: "over",
      pick: `${name} ${threshold}+ ${label}`,
      price,
      marketProb,
      modelProb,
      projection: proj ? round(proj.mean, 1) : null,
      hitProb: (1 - w) * marketProb + w * (modelProb ?? marketProb),
    });
  }
  return legs;
}

// ---- Ticket ------------------------------------------------------------------------------
function haircut(maxPerGame) {
  return CONFIG.fanduelHaircut.find((h) => maxPerGame <= h.maxPerGame).factor;
}

function pickTicket(pool, gameCount, tilt) {
  const perGameCap = Math.max(2, Math.ceil(CONFIG.legs / Math.max(1, gameCount)));
  const scored = pool
    .filter((leg) => leg.price >= CONFIG.minPrice && leg.price <= CONFIG.maxPrice)
    .map((leg) => ({ leg, score: Math.log(leg.hitProb) + tilt * Math.log(decimal(leg.price)) }))
    .sort((a, b) => b.score - a.score);
  const usedSlots = new Set();
  const perGame = new Map();
  const legs = [];
  for (const { leg } of scored) {
    if (legs.length >= CONFIG.legs) break;
    if (usedSlots.has(leg.slot)) continue;
    if ((perGame.get(leg.gameId) ?? 0) >= perGameCap) continue;
    usedSlots.add(leg.slot);
    perGame.set(leg.gameId, (perGame.get(leg.gameId) ?? 0) + 1);
    legs.push(leg);
  }
  const product = legs.reduce((acc, leg) => acc * decimal(leg.price), 1);
  const maxPerGame = Math.max(0, ...perGame.values());
  const factor = haircut(maxPerGame);
  const hitChance = legs.reduce((acc, leg) => acc * leg.hitProb, 1);
  return {
    legs,
    perGameCap,
    maxPerGame,
    rawPayout: CONFIG.stake * product,
    fanduelEstimate: (CONFIG.stake * product) / factor,
    haircutFactor: factor,
    hitChance,
  };
}

function buildTicket(pool, gameCount) {
  // Sweep the tilt toward price; of the tickets that reach the payout target, keep the one
  // most likely to cash. Hit chance stays the objective, price is only a constraint.
  let best = null;
  let fallback = null;
  for (let step = 0; step <= 150; step++) {
    const ticket = { ...pickTicket(pool, gameCount, step / 100), tilt: step / 100 };
    if (ticket.legs.length < CONFIG.legs) continue;
    if (ticket.fanduelEstimate >= CONFIG.targetPayout) {
      if (!best || ticket.hitChance > best.hitChance) best = ticket;
    } else if (!fallback || ticket.fanduelEstimate > fallback.fanduelEstimate) {
      fallback = ticket;
    }
  }
  return best ?? fallback;
}

function topPicks(pool) {
  const seen = new Set();
  return pool
    .filter((leg) => leg.market && !leg.market.endsWith("(alt)"))
    .map((leg) => ({ ...leg, ev: leg.hitProb * decimal(leg.price) - 1 }))
    .filter((leg) => leg.hitProb >= CONFIG.topPickFloor && leg.ev >= CONFIG.topPickMinEv)
    .sort((a, b) => b.hitProb - a.hitProb)
    .filter((leg) => (seen.has(leg.slot) ? false : (seen.add(leg.slot), true)))
    .slice(0, 12);
}

const slim = (leg) => ({
  gameId: leg.gameId,
  game: leg.game,
  player: leg.player ?? null,
  playerId: leg.playerId ?? null,
  line: leg.line ?? null,
  side: leg.side ?? null,
  startTime: leg.startTime,
  pick: leg.pick,
  market: leg.market,
  price: leg.price,
  hitProb: round(leg.hitProb),
  marketProb: round(leg.marketProb),
  modelProb: leg.modelProb == null ? null : round(leg.modelProb),
  projection: leg.projection ?? null,
  team: leg.team ?? null,
  kind: leg.kind,
  book: leg.book ?? "draftkings",
});

function renderMarkdown(result) {
  const t = result.ticket;
  const pct = (p) => `${Math.round(p * 1000) / 10}%`;
  const et = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const legs = [...t.legs].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.game.localeCompare(b.game));
  return [
    `# NBA ${result.date} — 25-leg longshot`,
    "",
    `Built ${result.builtAt.slice(0, 16).replace("T", " ")} UTC from ${result.source}. ${result.games.length} games.`,
    "",
    `**$${t.stake.toFixed(2)} → about $${t.fanduelEstimate.toLocaleString()} at FanDuel** (plain product $${t.rawPayout.toLocaleString()}, divided by ${t.haircutFactor} for same-game stacking, up to ${t.maxPerGame} legs in one game). ` +
      `Average leg hits ${pct(t.avgLegHit)}; the whole ticket is about 1 in ${Math.round(1 / t.hitChance).toLocaleString()}. It's a lottery ticket, not a best bet.`,
    "",
    "| # | Tip (ET) | Game | Leg | Price | Hit % |",
    "|---|---|---|---|---|---|",
    ...legs.map((l, i) => `| ${i + 1} | ${et(l.startTime)} | ${l.game} | ${l.pick} | ${fmtPrice(l.price)} | ${pct(l.hitProb)} |`),
    "",
    "## Top single picks (ranked by hit chance)",
    "",
    result.topPicks.length
      ? "Hit chance 55%+ at a roughly fair price (EV -2% or better). Mostly the market's own number with a small nudge from last season's averages, so expect modest edges."
      : "Nothing cleared 55% at a fair price today.",
    "",
    ...(result.topPicks.length
      ? ["| Game | Pick | Price | Hit % | EV |", "|---|---|---|---|---|", ...result.topPicks.map((l) => `| ${l.game} | ${l.pick} | ${fmtPrice(l.price)} | ${pct(l.hitProb)} | ${l.ev >= 0 ? "+" : ""}${pct(l.ev)} |`)]
      : []),
    "",
  ].join("\n");
}

// ---- Per-game sets + one pick per game -------------------------------------------------
const SETS = {
  minPrice: -250,
  maxPrice: 130,
  minEv: -0.06,
  fallbackMinEv: -0.1,
  legs: 6,
  tickets: 10,
  maxShare: 25 / 40, // no leg on more than this share of a game's tickets (same rule as NFL)
  lowerMinGain: 0.08, // an alt ("lowered") line must add 8+ points of hit chance
  lowerMinPrice: -300,
  maxLowered: 2,
  onePerGameMinPrice: -300,
  onePerGameMaxPrice: 150,
  onePerGameMinEv: -0.03,
};

const isMain = (leg) => !String(leg.market).endsWith("(alt)");
const legEv = (leg) => leg.hitProb * decimal(leg.price) - 1;
const toAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

function bestPerSlot(legs) {
  const bySlot = new Map();
  for (const leg of [...legs].sort((a, b) => b.hitProb - a.hitProb)) {
    const slot = leg.slot ?? leg.key;
    if (!bySlot.has(slot)) bySlot.set(slot, leg);
  }
  return [...bySlot.values()];
}

// The single most likely pick in each game, at a roughly fair price.
function onePerGame(pool, games) {
  const legs = [];
  for (const game of games) {
    const mains = pool.filter(
      (leg) => leg.gameId === game.id && isMain(leg) && leg.price >= SETS.onePerGameMinPrice && leg.price <= SETS.onePerGameMaxPrice,
    );
    const fair = mains.filter((leg) => legEv(leg) >= SETS.onePerGameMinEv);
    const pick = (fair.length ? fair : mains).sort((a, b) => b.hitProb - a.hitProb)[0];
    if (pick) legs.push(pick);
  }
  return legs;
}

// Swap up to two overs for an alt line of the same stat when it adds real hit chance.
function lowerLegs(legs, pool) {
  const options = legs
    .map((leg, i) => {
      if (leg.kind !== "prop" || leg.side !== "over") return null;
      const alts = pool.filter(
        (alt) =>
          alt.playerId === leg.playerId &&
          alt.market === `${leg.market} (alt)` &&
          alt.line <= Math.floor(leg.line) &&
          alt.price >= SETS.lowerMinPrice &&
          alt.hitProb - leg.hitProb >= SETS.lowerMinGain,
      );
      // Smallest drop that still clears the bar.
      const alt = alts.sort((a, b) => b.line - a.line)[0];
      return alt ? { i, alt, gain: alt.hitProb - leg.hitProb } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, SETS.maxLowered);
  const out = [...legs];
  for (const { i, alt } of options) out[i] = { ...alt, loweredFrom: legs[i].pick };
  return out;
}

function gameSeries(pool, game) {
  const eligible = (minEv) =>
    bestPerSlot(
      pool.filter(
        (leg) => leg.gameId === game.id && isMain(leg) && leg.price >= SETS.minPrice && leg.price <= SETS.maxPrice && legEv(leg) >= minEv,
      ),
    );
  // A book with a fat hold on one game can leave too few fair legs; loosen once before giving up.
  let ranked = eligible(SETS.minEv);
  if (ranked.length < 2 * SETS.legs) ranked = eligible(SETS.fallbackMinEv);
  const size = ranked.length >= 2 * SETS.legs ? SETS.legs : ranked.length >= 10 ? 5 : 0;
  if (!size) return null;
  // More depth, more tickets: 5 to 10.
  const count = clamp(ranked.length - size, 5, SETS.tickets);
  const cap = Math.max(1, Math.floor(SETS.maxShare * count));
  const first = ranked.slice(0, size);
  const rest = ranked.slice(size);
  const uses = new Map();
  const seen = new Set();
  const tickets = [];
  const available = (leg, taken) => (uses.get(leg.key) ?? 0) < cap && !taken.has(leg.key);
  for (let t = 0; t < count; t++) {
    // Drift: ticket t swaps out about t/(count-1) of ticket 1; the last shares nothing with it.
    const fresh = t === 0 ? 0 : Math.max(1, Math.round((size * t) / (count - 1)));
    const taken = new Set();
    const legs = [];
    for (const leg of first) {
      if (legs.length >= size - fresh) break;
      if (available(leg, taken)) (legs.push(leg), taken.add(leg.key));
    }
    // Rotate the start of the fill so neighbouring tickets don't repeat the same new legs.
    const fill = [...rest.slice(t % Math.max(1, rest.length)), ...rest.slice(0, t % Math.max(1, rest.length))].sort(
      (a, b) => (uses.get(a.key) ?? 0) - (uses.get(b.key) ?? 0) || b.hitProb - a.hitProb,
    );
    for (const leg of fill) {
      if (legs.length >= size) break;
      if (available(leg, taken)) (legs.push(leg), taken.add(leg.key));
    }
    if (legs.length < size) break;
    const signature = legs.map((leg) => leg.key).sort().join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    legs.forEach((leg) => uses.set(leg.key, (uses.get(leg.key) ?? 0) + 1));
    const final = lowerLegs(legs, pool);
    tickets.push({
      legs: final.map((leg) => ({ ...slim(leg), loweredFrom: leg.loweredFrom ?? null })),
      lowered: final.filter((leg) => leg.loweredFrom).length,
      sharesWithTicket1: legs.filter((leg) => first.includes(leg)).length,
      odds: round(final.reduce((acc, leg) => acc * decimal(leg.price), 1), 2),
      hitChance: round(final.reduce((acc, leg) => acc * leg.hitProb, 1), 4),
    });
  }
  return { legsPerTicket: size, cap, tickets };
}

function renderSetsMarkdown(sets) {
  const pct = (p) => `${Math.round(p * 1000) / 10}%`;
  const et = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const lines = [
    `# NBA ${sets.date} — one pick per game + single-game sets`,
    "",
    `Lines: ${sets.source}. Odds are the plain product of the legs; FanDuel prices same-game parlays lower.`,
    "",
  ];
  if (sets.onePerGame) {
    const o = sets.onePerGame;
    lines.push(
      `## One pick per game (${o.legs.length} legs)`,
      "",
      `Pays about ${o.odds}x (${fmtPrice(o.american)}) and hits about ${pct(o.hitChance)} of the time.`,
      "",
      "| Tip (ET) | Game | Pick | Price | Hit % |",
      "|---|---|---|---|---|",
      ...o.legs.map((l) => `| ${et(l.startTime)} | ${l.game} | ${l.pick} | ${fmtPrice(l.price)} | ${pct(l.hitProb)} |`),
      "",
    );
  }
  for (const g of Object.values(sets.games).sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    lines.push(`## ${g.label} — ${et(g.startTime)} ET (${g.tickets.length} tickets of ${g.legsPerTicket})`, "");
    g.tickets.forEach((t, i) => {
      lines.push(
        `**Ticket ${i + 1}** — ${t.odds}x, hits ~${pct(t.hitChance)}${t.lowered ? `, ${t.lowered} lowered` : ""}`,
        "",
        ...t.legs.map((l) => `- ${l.pick} (${fmtPrice(l.price)}, ${pct(l.hitProb)})${l.loweredFrom ? ` — lowered from ${l.loweredFrom}` : ""}`),
        "",
      );
    });
  }
  return lines.join("\n");
}

function buildSets(date, pool, open, slate, now, stamp) {
  const file = path.join(PICKS_DIR, `nba-sets-${date}.json`);
  const existing = fs.existsSync(file) ? readJson(file) : null;
  const firstTip = Math.min(...slate.map((game) => new Date(game.startTime).getTime()));
  const sets = {
    version: 1,
    date,
    source: bookSource(pool),
    updatedAt: now.toISOString(),
    onePerGame: existing?.onePerGame ?? null,
    onePerGameHistory: existing?.onePerGameHistory ?? [],
    games: { ...(existing?.games ?? {}) },
  };
  const notes = [];

  // One pick per game needs every game of the day still open; it locks at the first tip.
  if (firstTip > now.getTime() && open.length === slate.length && (!existing?.onePerGame || REBUILD_SETS)) {
    const legs = onePerGame(pool, open);
    if (legs.length === slate.length) {
      if (existing?.onePerGame) sets.onePerGameHistory.push(existing.onePerGame);
      const dec = legs.reduce((acc, leg) => acc * decimal(leg.price), 1);
      sets.onePerGame = {
        builtAt: now.toISOString(),
        inputsSnapshot: `data/snapshots/nba/${date}/${stamp}.json`,
        legs: legs.map(slim),
        odds: round(dec, 2),
        american: toAmerican(dec),
        hitChance: round(legs.reduce((acc, leg) => acc * leg.hitProb, 1), 4),
      };
      notes.push(`one-per-game ${legs.length} legs ${fmtPrice(sets.onePerGame.american)}`);
    }
  }

  // Per-game sets: each game locks at its own tip (open only holds games not yet started).
  for (const game of open) {
    const prev = existing?.games?.[game.id];
    if (prev && !REBUILD_SETS) continue;
    const series = gameSeries(pool, game);
    if (!series?.tickets.length) {
      notes.push(`${game.label}: not enough legs yet`);
      continue;
    }
    sets.games[game.id] = {
      gameId: game.id,
      label: game.label,
      startTime: game.startTime,
      builtAt: now.toISOString(),
      inputsSnapshot: `data/snapshots/nba/${date}/${stamp}.json`,
      ...series,
      history: prev ? [...(prev.history ?? []), { ...prev, history: undefined }] : [],
    };
    notes.push(`${game.label} ${series.tickets.length}x${series.legsPerTicket}`);
  }

  if (!notes.length) return;
  if (existing) {
    const backupDir = path.join(PICKS_DIR, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(file, path.join(backupDir, `nba-sets-${date}-before-${stamp}.json`));
  }
  fs.writeFileSync(file, JSON.stringify(sets, null, 2) + "\n");
  fs.writeFileSync(file.replace(/\.json$/, ".md"), renderSetsMarkdown(sets));
  console.log(`${date} sets: ${notes.join(", ")}`);
}

// ---- Main --------------------------------------------------------------------------------
async function buildDay(date, perGame, ratings, hca, index, now) {
  const outFile = path.join(PICKS_DIR, `nba-parlays-${date}.json`);
  const setsFile = path.join(PICKS_DIR, `nba-sets-${date}.json`);
  const existing = fs.existsSync(outFile) ? readJson(outFile) : null;
  const existingSets = fs.existsSync(setsFile) ? readJson(setsFile) : null;
  const slate = await fetchSlate(date);
  if (!slate.length) return console.log(`${date}: no games`);
  const firstTip = Math.min(...slate.map((game) => new Date(game.startTime).getTime()));
  const open = slate.filter((game) => new Date(game.startTime).getTime() > now.getTime());
  // Saved tickets stay put unless --rebuild, and never once their game has tipped.
  const ticketNeeded = firstTip > now.getTime() && (!existing || REBUILD);
  const setsNeeded =
    open.some((game) => REBUILD_SETS || !existingSets?.games?.[game.id]) ||
    (firstTip > now.getTime() && (REBUILD_SETS || !existingSets?.onePerGame));
  if (!ticketNeeded && !setsNeeded && !DRY_RUN) return console.log(`${date}: everything already saved (--rebuild before tip to refresh)`);

  const pool = [];
  const withProps = new Set();
  for (const game of open) {
    const [dkLines, dkItems] = await Promise.all([fetchGameLines(game), fetchPropBets(game)]);
    const ids = dkItems.map((item) => item.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1]).filter(Boolean);
    await resolveNames(ids, index);
    const fd = await fetchFanDuelGame(game, index);
    if (fd?.unmatched.length) console.log(`${game.label}: FanDuel names not matched (DraftKings used if posted): ${fd.unmatched.join(", ")}`);
    const { lines, items } = mergeBooks(fd, dkLines, dkItems);
    pool.push(...sideLegs(game, lines, ratings, hca));
    const props = propLegs(game, items, index, perGame);
    if (props.length) withProps.add(game.id);
    pool.push(...props);
  }
  if (!pool.length) return console.log(`${date}: no lines posted yet`);
  if (withProps.size < open.length) {
    return console.log(`${date}: props posted for ${withProps.size}/${open.length} games, wait until they're all up`);
  }
  if (DRY_RUN) {
    const ticket = buildTicket(pool, open.length);
    const fdLegs = pool.filter((leg) => leg.book === "fanduel").length;
    console.log(`${date} (dry run, nothing written): ${open.length} games, pool ${pool.length} (${fdLegs} FanDuel, ${pool.length - fdLegs} DraftKings). ${bookSource(pool)}`);
    if (ticket) {
      const fdTicket = ticket.legs.filter((leg) => leg.book === "fanduel").length;
      console.log(`  25-leg: ${fdTicket}/${ticket.legs.length} FanDuel legs, FanDuel est $${Math.round(ticket.fanduelEstimate).toLocaleString()}, 1 in ${Math.round(1 / ticket.hitChance).toLocaleString()}`);
      for (const leg of ticket.legs.slice(0, 6)) console.log(`    ${leg.book === "fanduel" ? "FD" : "DK"} ${leg.game} ${leg.pick} ${fmtPrice(leg.price)} ${(leg.hitProb * 100).toFixed(1)}%`);
    }
    return;
  }

  fs.mkdirSync(path.join(SNAP_DIR, date), { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(SNAP_DIR, date, `${stamp}.json`), JSON.stringify({ date, takenAt: now.toISOString(), games: open, pool: pool.map(slim) }));

  if (setsNeeded) buildSets(date, pool, open, slate, now, stamp);
  if (!ticketNeeded) return console.log(`${date}: 25-leg ticket already saved, left as is`);

  const ticket = buildTicket(pool, open.length);
  if (!ticket) return console.log(`${date}: not enough legs for ${CONFIG.legs}`);
  const result = {
    version: 1,
    date,
    builtAt: now.toISOString(),
    inputsSnapshot: `data/snapshots/nba/${date}/${stamp}.json`,
    source: bookSource(pool),
    games: open.map((game) => ({ id: game.id, label: game.label, startTime: game.startTime })),
    ticket: {
      legs: ticket.legs.map(slim),
      stake: CONFIG.stake,
      perGameCap: ticket.perGameCap,
      maxPerGame: ticket.maxPerGame,
      priceTilt: ticket.tilt,
      rawPayout: Math.round(ticket.rawPayout),
      fanduelEstimate: Math.round(ticket.fanduelEstimate),
      haircutFactor: ticket.haircutFactor,
      hitChance: ticket.hitChance,
      avgLegHit: round(ticket.legs.reduce((sum, leg) => sum + leg.hitProb, 0) / ticket.legs.length),
    },
    topPicks: topPicks(pool).map((leg) => ({ ...slim(leg), ev: round(leg.ev) })),
    poolSize: pool.length,
    history: existing ? [...(existing.history ?? []), { ...existing, history: undefined }] : [],
  };
  fs.mkdirSync(PICKS_DIR, { recursive: true });
  if (existing) {
    // Belt and braces: the old build also lives in result.history.
    const backupDir = path.join(PICKS_DIR, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(outFile, path.join(backupDir, `nba-parlays-${date}-before-${stamp}.json`));
  }
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(outFile.replace(/\.json$/, ".md"), renderMarkdown(result));
  console.log(
    `${date}: ${open.length} games, pool ${pool.length}, ${ticket.legs.length} legs (max ${ticket.maxPerGame}/game, tilt ${ticket.tilt}), ` +
      `$${CONFIG.stake} -> raw $${Math.round(ticket.rawPayout).toLocaleString()} / FanDuel est $${Math.round(ticket.fanduelEstimate).toLocaleString()}, ` +
      `avg leg hit ${(result.ticket.avgLegHit * 100).toFixed(1)}%, top picks ${result.topPicks.length}`,
  );
  return result;
}

const now = new Date();
const today = easternDate(now);
const dates = (argValue("--dates") ?? `${today},${addDays(today, 1)}`).split(",").map((d) => d.trim());
const perGame = await loadPerGame();
const ratingsFile = path.join(NBA_DIR, "power-ratings-2026-27.json");
const ratings = fs.existsSync(ratingsFile) ? readJson(ratingsFile) : null;
const params = fs.existsSync(path.join(NBA_DIR, "model-params.json")) ? readJson(path.join(NBA_DIR, "model-params.json")).params : {};
const hca = clamp(params.hcaPoints ?? 1.6, 0, 4);
const index = buildNameIndex();
for (const date of dates) await buildDay(date, perGame, ratings, hca, index, now);
