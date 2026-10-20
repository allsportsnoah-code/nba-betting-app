// Records the lines actually placed on FanDuel for a day's 25-leg ticket.
//
//   node scripts/apply-nba-placed-lines.mjs --date 2026-10-20
//
// Reads data/picks/nba-placed-<date>.json ({ stake?, payout?, changes: [{ from: "<saved pick text>", line, price }] }).
// The saved ticket is never edited in place: the version before goes to `history` (and
// data/picks/backups/), and the current ticket gets the placed lines, with `placedFrom` on each
// changed leg. Hit chance is recomputed the builder's way: the price's no-vig chance (two-way hold
// assumed ~4.5%, since only one side's price is known) blended with our projection.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const date = args[args.indexOf("--date") + 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("usage: --date YYYY-MM-DD");

const ROOT = process.cwd();
const PICKS_DIR = path.join(ROOT, "data", "picks");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const implied = (american) => (american < 0 ? -american / (-american + 100) : 100 / (american + 100));
const decimal = (american) => (american < 0 ? 1 + 100 / -american : 1 + american / 100);
const fmtPrice = (american) => (american > 0 ? `+${american}` : `${american}`);
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Same projection settings as scripts/build-nba-parlays.mjs.
const PROP_MODEL_WEIGHT = 0.25;
const MIN_GAMES = 15;
const TWO_WAY_HOLD = 1.045;
const STAT_K = { pts: 8, reb: 10, ast: 8, fg3: 15, stl: 40, blk: 25 };
const LABEL_STAT = { Pts: "pts", Reb: "reb", Ast: "ast", "3PM": "fg3", Stl: "stl", Blk: "blk" };
const normalizeName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.',]/g, "")
    .replace(/-/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const NAME_ALIASES = { "ronald holland": "ron holland" };
const matchKey = (name) => NAME_ALIASES[normalizeName(name)] ?? normalizeName(name);
const perGame = readJson(path.join(ROOT, "data", "nba", "player-per-game-2025-26.json")).players;

function projection(name, parts) {
  const stats = perGame[matchKey(name)];
  if (!stats || stats.games < MIN_GAMES) return null;
  const mean = parts.reduce((sum, stat) => sum + stats[stat], 0);
  const variance = parts.reduce((sum, stat) => sum + stats[stat] + stats[stat] ** 2 / STAT_K[stat], 0) * (parts.length > 1 ? 1.25 : 1);
  return { mean, sd: Math.max(0.6, Math.sqrt(variance)) };
}

const PICK = /^(.+) (Over|Under) ([\d.]+) ([A-Za-z0-9+]+)$/;

function placedLeg(leg, change) {
  const m = leg.pick.match(PICK);
  if (!m) throw new Error(`can't parse saved pick "${leg.pick}"`);
  const [, name, side, , label] = m;
  const parts = label.split("+").map((part) => LABEL_STAT[part]);
  const proj = parts.every(Boolean) ? projection(name, parts) : null;
  const marketProb = implied(change.price) / TWO_WAY_HOLD;
  let modelProb = null;
  let w = 0;
  if (proj) {
    const over = 1 - normCdf((change.line - proj.mean) / proj.sd);
    modelProb = side === "Over" ? over : 1 - over;
    w = PROP_MODEL_WEIGHT * clamp(1.5 - Math.abs(change.line - proj.mean) / proj.sd, 0, 1);
  }
  return {
    ...leg,
    pick: `${name} ${side} ${change.line} ${label}`,
    line: change.line,
    side: side.toLowerCase(),
    price: change.price,
    marketProb: round(marketProb),
    modelProb: modelProb == null ? null : round(modelProb),
    hitProb: round((1 - w) * marketProb + w * (modelProb ?? marketProb)),
    book: "fanduel",
    placedFrom: `${leg.pick} (${fmtPrice(leg.price)})`,
  };
}

const placedFile = path.join(PICKS_DIR, `nba-placed-${date}.json`);
const ticketFile = path.join(PICKS_DIR, `nba-parlays-${date}.json`);
const placed = readJson(placedFile);
const day = readJson(ticketFile);

const legs = day.ticket.legs.map((leg) => {
  const change = placed.changes.find((c) => c.from === leg.pick);
  return change ? placedLeg(leg, change) : leg;
});
// A leg already set to its placed line carries the original in placedFrom ("<pick> (<price>)").
const missing = placed.changes.filter((c) => !day.ticket.legs.some((leg) => leg.pick === c.from || leg.placedFrom?.startsWith(`${c.from} (`)));
if (missing.length) throw new Error(`not on the saved ticket: ${missing.map((c) => c.from).join("; ")}`);
const changed = legs.filter((leg, i) => leg !== day.ticket.legs[i]);
const product = legs.reduce((acc, leg) => acc * decimal(leg.price), 1);
// The real stake and FanDuel's quoted payout, when given: also measures FanDuel's haircut.
const bet =
  placed.stake && placed.payout
    ? { stake: placed.stake, payout: placed.payout, haircut: round(product / (placed.payout / placed.stake), 2) }
    : {};

if (!changed.length) {
  // Lines already applied: only add the stake/payout record (picks untouched).
  if (!bet.stake || (day.ticket.placed?.stake === bet.stake && day.ticket.placed?.payout === bet.payout)) {
    console.log(`${date}: placed lines already applied`);
    process.exit(0);
  }
  day.ticket.placed = { ...day.ticket.placed, ...bet };
  fs.writeFileSync(ticketFile, JSON.stringify(day, null, 2) + "\n");
  console.log(`${date}: recorded $${bet.stake} to win $${bet.payout.toLocaleString()} (FanDuel paid the plain product / ${bet.haircut})`);
  process.exit(0);
}

const stamp = new Date().toISOString();
const updated = {
  ...day,
  ticket: {
    ...day.ticket,
    legs,
    rawPayout: Math.round(day.ticket.stake * product),
    fanduelEstimate: Math.round((day.ticket.stake * product) / day.ticket.haircutFactor),
    hitChance: legs.reduce((acc, leg) => acc * leg.hitProb, 1),
    avgLegHit: round(legs.reduce((sum, leg) => sum + leg.hitProb, 0) / legs.length),
    placed: { at: placed.recordedAt ?? stamp, note: placed.note, changed: changed.length, ...bet },
  },
  history: [...(day.history ?? []), { ...day, history: undefined }],
};

const backupDir = path.join(PICKS_DIR, "backups");
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(ticketFile, path.join(backupDir, `nba-parlays-${date}-before-placed-${stamp.replace(/[:.]/g, "-")}.json`));
fs.writeFileSync(ticketFile, JSON.stringify(updated, null, 2) + "\n");

const t = updated.ticket;
console.log(`${date}: ${changed.length} legs set to the placed FanDuel lines; earlier version kept in history`);
for (const leg of changed) console.log(`  ${leg.pick} ${fmtPrice(leg.price)} ${(leg.hitProb * 100).toFixed(1)}%  (was ${leg.placedFrom})`);
console.log(
  `  $${t.stake} -> raw $${t.rawPayout.toLocaleString()} / FanDuel est $${t.fanduelEstimate.toLocaleString()}, 1 in ${Math.round(1 / t.hitChance).toLocaleString()}, avg leg ${(t.avgLegHit * 100).toFixed(1)}%`,
);
