// Swaps a leg that can't be bet on FanDuel out of one game's saved single-game tickets.
//
//   node scripts/build-nba-parlays.mjs --dry-run --dates <date> --pool-out <pool.json>
//   node scripts/replace-nba-set-leg.mjs --date <date> --game "BOS @ DET" --remove "<pick>" --pool <pool.json>
//
// Each ticket holding the leg gets the highest-hit FanDuel prop from that game that isn't already
// on it (main lines, the set builder's price and EV limits, one leg per player). The game's set
// before the swap goes to its `history` (and data/picks/backups/); swapped legs carry `replacedFrom`.
// Refuses once the game has tipped.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const [date, gameLabel, remove, poolFile] = [arg("--date"), arg("--game"), arg("--remove"), arg("--pool")];
if (!date || !gameLabel || !remove || !poolFile) throw new Error('usage: --date YYYY-MM-DD --game "AWY @ HOM" --remove "<pick>" --pool <file>');

const PICKS_DIR = path.join(process.cwd(), "data", "picks");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const decimal = (american) => (american < 0 ? 1 + 100 / -american : 1 + american / 100);
// Same limits as SETS in scripts/build-nba-parlays.mjs.
const SETS = { minPrice: -250, maxPrice: 130, minEv: -0.06 };

const file = path.join(PICKS_DIR, `nba-sets-${date}.json`);
const sets = readJson(file);
const entry = Object.entries(sets.games).find(([, g]) => g.label === gameLabel);
if (!entry) throw new Error(`${gameLabel} has no saved set on ${date}`);
const [gameId, game] = entry;
if (new Date(game.startTime).getTime() <= Date.now()) throw new Error(`${gameLabel} has tipped; its set stays as saved`);

const pool = readJson(poolFile).filter(
  (leg) =>
    leg.gameId === gameId &&
    leg.kind === "prop" &&
    leg.book === "fanduel" &&
    !String(leg.market).endsWith("(alt)") &&
    leg.price >= SETS.minPrice &&
    leg.price <= SETS.maxPrice &&
    leg.hitProb * decimal(leg.price) - 1 >= SETS.minEv,
);

const swaps = [];
const ticketKey = (legs) => legs.map((leg) => leg.pick).sort().join("|");
// Never turn one ticket into a copy of another.
const taken = new Set(game.tickets.map((ticket) => ticketKey(ticket.legs)));
const tickets = game.tickets.map((ticket, i) => {
  const at = ticket.legs.findIndex((leg) => leg.pick === remove);
  if (at < 0) return ticket;
  const players = new Set(ticket.legs.filter((leg) => leg.pick !== remove).map((leg) => leg.player).filter(Boolean));
  const picks = new Set(ticket.legs.map((leg) => leg.pick));
  const kept = ticket.legs.filter((leg) => leg.pick !== remove);
  const pick = [...pool]
    .sort((a, b) => b.hitProb - a.hitProb)
    .find((leg) => !players.has(leg.player) && !picks.has(leg.pick) && !taken.has(ticketKey([...kept, leg])));
  if (pick) taken.add(ticketKey([...kept, pick]));
  if (!pick) throw new Error(`no FanDuel replacement left for ticket ${i + 1}`);
  const { slot, ...leg } = pick;
  const legs = ticket.legs.map((old, j) => (j === at ? { ...leg, loweredFrom: null, replacedFrom: `${remove} (not on FanDuel)` } : old));
  swaps.push(`ticket ${i + 1}: ${leg.pick} (${leg.price}, ${(leg.hitProb * 100).toFixed(1)}%)`);
  return {
    ...ticket,
    legs,
    odds: round(legs.reduce((acc, l) => acc * decimal(l.price), 1), 2),
    hitChance: round(legs.reduce((acc, l) => acc * l.hitProb, 1), 4),
  };
});
if (!swaps.length) {
  console.log(`${gameLabel}: "${remove}" isn't on any ticket (already replaced?)`);
  process.exit(0);
}
// sharesWithTicket1 follows the new ticket 1.
const first = new Set(tickets[0].legs.map((leg) => leg.pick));
for (const ticket of tickets) ticket.sharesWithTicket1 = ticket.legs.filter((leg) => first.has(leg.pick)).length;

const stamp = new Date().toISOString();
const { history = [], ...before } = game;
sets.games[gameId] = { ...game, tickets, builtAt: stamp, history: [...history, before] };
sets.updatedAt = stamp;

const backupDir = path.join(PICKS_DIR, "backups");
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(file, path.join(backupDir, `nba-sets-${date}-before-replace-${stamp.replace(/[:.]/g, "-")}.json`));
fs.writeFileSync(file, JSON.stringify(sets, null, 2) + "\n");
console.log(`${date} ${gameLabel}: replaced "${remove}" (earlier set kept in history)`);
for (const line of swaps) console.log(`  ${line}`);
