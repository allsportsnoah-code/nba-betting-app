// Compares ways to build 25-leg tickets on Week 6 pre-game data, graded against real results.
const fs = require("fs");
const D = __dirname;
const WEEK = Number(process.argv[2] ?? 6);
const pool = JSON.parse(fs.readFileSync(D + `/pool-w${WEEK}.json`, "utf8"));

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, "").replace(/[^a-z]/g, "");
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const decimalOf = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const fairAm = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p));

async function getJson(u) {
  const r = await fetch(u);
  return r.ok ? r.json() : null;
}

(async () => {
  // ── Results: final scores, box-score stats, who played ──
  const board = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=${WEEK}`);
  const finals = new Map();
  const stats = new Map(); // normName -> {stat: value}
  const played = new Map(); // last name -> [{full?, dnp}]
  for (const e of board.events) {
    const c = e.competitions[0];
    if (!c.status.type.completed) continue;
    const home = c.competitors.find((x) => x.homeAway === "home");
    const away = c.competitors.find((x) => x.homeAway === "away");
    finals.set(`${away.team.displayName} @ ${home.team.displayName}`, { home: +home.score, away: +away.score });
    const sum = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`);
    for (const t of sum?.boxscore?.players ?? []) {
      for (const cat of t.statistics) {
        for (const a of cat.athletes) {
          const k = norm(a.athlete.displayName);
          const s = stats.get(k) ?? {};
          cat.labels.forEach((lab, i) => (s[`${cat.name}.${lab}`] = Number(String(a.stats[i] ?? "0").split("/")[0]) || 0));
          stats.set(k, s);
        }
      }
    }
    const comps = await getJson(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${e.id}/competitions/${e.id}/competitors`);
    for (const it of comps?.items ?? []) {
      const ro = await getJson(`${it.$ref.split("?")[0]}/roster`);
      for (const en of ro?.entries ?? []) {
        const k = norm(en.displayName);
        played.set(k, [...(played.get(k) ?? []), en.didNotPlay ? "dnp" : "played"]);
      }
    }
  }
  const lastOf = (name) => norm(String(name).replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, "").trim().split(/\s+/).pop());
  const statFor = (name, market) => {
    const s = stats.get(norm(name));
    const pick = (s) => {
      switch (market) {
        case "player_receptions": return s["receiving.REC"] ?? 0;
        case "player_reception_yds": return s["receiving.YDS"] ?? 0;
        case "player_rush_yds": return s["rushing.YDS"] ?? 0;
        case "player_rush_attempts": return s["rushing.CAR"] ?? 0;
        case "player_pass_yds": return s["passing.YDS"] ?? 0;
        case "player_tackles_assists": return s["defensive.TOT"] ?? 0;
        case "player_sacks": return s["defensive.SACKS"] ?? 0;
        case "player_kicking_points": return s["kicking.PTS"] ?? 0;
        case "player_anytime_td": return (s["rushing.TD"] ?? 0) + (s["receiving.TD"] ?? 0);
      }
      return null;
    };
    if (s) return pick(s);
    const pl = played.get(lastOf(name));
    if (pl && pl.length === 1) return pl[0] === "played" ? 0 : "void";
    return "void";
  };
  const judge = (actual, line, dir) => (actual === "void" ? "void" : dir === "over" ? (actual > line ? "win" : actual < line ? "loss" : "push") : dir === "under" ? (actual < line ? "win" : actual > line ? "loss" : "push") : actual >= 1 ? "win" : "loss");

  // ── Candidate legs ──
  const gameKeyOf = new Map(pool.spotlights.map((s) => [s.eventLabel, `${s.away}@${s.home}`]));
  const legs = [];
  for (const p of pool.projections) {
    if (p.direction === "yes" || p.line == null || !Number.isInteger(p.line * 2) || p.market === "player_rush_attempts") continue;
    if (!gameKeyOf.has(p.gameLabel) || p.confidence === "low" || Math.abs(p.modelProb - p.marketProb) > 0.22) continue;
    const f = finals.get(p.gameLabel);
    const res = f ? judge(statFor(p.playerName, p.market), p.line, p.direction) : "pending";
    legs.push({ id: `${p.playerId}|${p.market}|${p.direction}|${p.line}`, group: `${p.playerId}|${p.market}`, player: p.playerId, game: gameKeyOf.get(p.gameLabel), label: p.side, market: p.market, dir: p.direction, odds: p.odds, hit: p.finalProb, ev: p.ev, dk: p.lineSource === "draftkings", alt: false, res });
  }
  for (const s of pool.spotlights) {
    const f = finals.get(s.eventLabel);
    const game = `${s.away}@${s.home}`;
    for (const b of s.bets) {
      if (Math.abs(b.modelProb - b.marketProb) > 0.15) continue;
      let res = "pending";
      if (f) {
        const isHome = b.sideTeam === s.homeName;
        const margin = isHome ? f.home - f.away : f.away - f.home;
        if (b.market === "moneyline") res = margin > 0 ? "win" : margin < 0 ? "loss" : "push";
        else if (b.market === "spread") res = margin + b.line > 0 ? "win" : margin + b.line < 0 ? "loss" : "push";
        else res = judge(f.home + f.away, b.line, b.side);
      }
      const kind = b.market === "total" ? "total" : "side";
      legs.push({ id: `g:${game}:${b.market}:${b.side}:${b.line}`, group: `g:${game}:${kind}`, player: `g:${game}:${kind}`, game, label: `${game} ${b.label}`, market: b.market, dir: b.side, odds: b.odds, hit: b.hitProb, ev: b.ev, alt: false, res });
    }
    // Lowered (alternate) lines: team totals / alt totals / alt spreads, and player overs ("X+").
    for (const l of s.gameLadders) {
      for (const r of l.rows) {
        if (r.main || r.model == null || r.model < r.hitProb || r.model - r.hitProb > 0.05) continue;
        let res = "pending";
        if (f) {
          if (l.kind === "total") res = judge(f.home + f.away, r.line, l.direction);
          else {
            const isHome = l.sideTeam === s.homeName;
            const pts = isHome ? f.home : f.away;
            const margin = isHome ? f.home - f.away : f.away - f.home;
            res = l.kind === "team_total" ? judge(pts, r.line, l.direction) : margin + r.line > 0 ? "win" : margin + r.line < 0 ? "loss" : "push";
          }
        }
        const grp = `g:${game}:${l.kind}:${l.sideTeam ?? ""}:${l.direction}`;
        legs.push({ id: `alt:${grp}:${r.line}`, group: grp, player: grp, game, label: `${l.title} ${r.label}`, market: l.kind, dir: l.direction, odds: fairAm(Math.min(0.97, r.hitProb + 0.04)), hit: r.hitProb, ev: -0.04, alt: true, res });
      }
    }
    for (const l of s.propLadders) {
      if (!l.prop) continue;
      for (const r of l.rows) {
        if (r.main || !r.label.startsWith("Over") || !r.season || r.season.games < 4 || r.season.hits / r.season.games < 0.75) continue;
        const res = f ? judge(statFor(l.prop.playerName, l.prop.market), r.line, "over") : "pending";
        legs.push({ id: `alt:${l.prop.playerId}|${l.prop.market}|${r.line}`, group: `${l.prop.playerId}|${l.prop.market}`, player: l.prop.playerId, game, label: `${l.prop.playerName} ${Math.ceil(r.line)}+ ${l.prop.marketLabel}`, market: l.prop.market, dir: "over", odds: fairAm(Math.min(0.97, r.hitProb + 0.04)), hit: r.hitProb, ev: -0.04, alt: true, res });
      }
    }
  }

  // ── Ticket builder: same rules as the site (groups, per-game cap, 25-of-40 player cap, drift to all-new) ──
  function series(cands, { size = 25, count = 40, perGame = 4, share = 25 / 40, score = (l) => Math.log(l.hit) } = {}) {
    const cap = Math.floor(count * share);
    const fits = (t, l) => !t.some((x) => x.group === l.group || x.id === l.id) && t.filter((x) => x.game === l.game).length < perGame;
    const best = (t, cs) => cs.filter((c) => fits(t, c)).sort((a, b) => score(b) - score(a))[0] ?? null;
    const first = [];
    while (first.length < size) {
      const n = best(first, cands);
      if (!n) return null;
      first.push(n);
    }
    const firstIds = new Set(first.map((l) => l.id));
    const firstGroups = new Set(first.map((l) => l.group));
    const fresh = cands.filter((l) => !firstGroups.has(l.group));
    const uses = new Map();
    const count1 = (t) => new Set(t.map((l) => l.player)).forEach((k) => uses.set(k, (uses.get(k) ?? 0) + 1));
    const tickets = [first];
    count1(first);
    let cur = [...first];
    for (let i = 1; i < count; i++) {
      const target = Math.round((size * i) / (count - 1));
      const t = [...cur];
      const capped = t.filter((l) => (uses.get(l.player) ?? 0) >= cap);
      if (capped.length) capped.forEach((l) => t.splice(t.indexOf(l), 1));
      else {
        const changed = t.filter((l) => !firstIds.has(l.id)).length;
        const olds = t.filter((l) => firstIds.has(l.id));
        const pool = changed < target && olds.length ? olds : t.filter((l) => !firstIds.has(l.id));
        const drop = pool.sort((a, b) => score(a) - score(b))[0];
        if (drop) t.splice(t.indexOf(drop), 1);
      }
      const used = new Set(tickets.flat().map((l) => l.id));
      const open = fresh.filter((l) => (uses.get(l.player) ?? 0) < cap);
      while (t.length < size) {
        const n = best(t, open.filter((l) => !used.has(l.id))) ?? best(t, open);
        if (!n) break;
        t.push(n);
      }
      if (t.length < size) break;
      tickets.push(t);
      count1(t);
      cur = t;
    }
    return tickets;
  }

  const graded = (l) => l.res === "win" || l.res === "loss";
  const report = (name, cands, opts) => {
    const tickets = series(cands, opts);
    if (!tickets) return console.log(`${name.padEnd(34)} not enough legs (${cands.length})`);
    const used = [...new Map(tickets.flat().map((l) => [l.id, l])).values()];
    const g = used.filter(graded);
    const legRate = g.filter((l) => l.res === "win").length / Math.max(1, g.length);
    const misses = tickets.map((t) => t.filter((l) => l.res === "loss").length);
    const cashed = tickets.filter((t) => t.every((l) => l.res === "win" || l.res === "void" || l.res === "push")).length;
    const alive = tickets.filter((t) => !t.some((l) => l.res === "loss") && t.some((l) => l.res === "pending")).length;
    const dec = tickets.map((t) => t.reduce((d, l) => d * decimalOf(l.odds), 1));
    const medDec = [...dec].sort((a, b) => a - b)[Math.floor(dec.length / 2)];
    const sameGame = tickets[0].reduce((m, l) => ((m[l.game] = (m[l.game] ?? 0) + 1), m), {});
    const fdFactor = Math.max(...Object.values(sameGame)) <= 2 ? 3.5 : 7.6;
    const avgPred = used.reduce((a, l) => a + l.hit, 0) / used.length;
    console.log(
      `${name.padEnd(34)} tickets ${String(tickets.length).padStart(2)} | legs ${String(used.length).padStart(3)} predicted ${Math.round(avgPred * 100)}% actual ${Math.round(legRate * 100)}% | misses: fewest ${Math.min(...misses)}, avg ${(misses.reduce((a, b) => a + b, 0) / misses.length).toFixed(1)} | cashed ${cashed}${alive ? ` alive ${alive}` : ""} | 20c pays ~$${Math.round((0.2 * medDec) / fdFactor).toLocaleString()} (FanDuel est.)`
    );
    return { name, tickets };
  };

  const main = legs.filter((l) => !l.alt);
  const near = (l) => l.odds >= -135 && l.odds <= 120;
  const underTypes = new Set(["player_rush_yds", "player_sacks", "player_tackles_assists"]);
  console.log(`candidates: ${main.length} main-line legs, ${legs.length - main.length} lowered-line legs; graded ${legs.filter(graded).length}\n`);
  report("A. Original rules (hit-ranked)", main.filter((l) => l.hit >= 0.52 && l.ev >= -0.03));
  report("B. Edge-first (58%+ near even/unders)", main.filter((l) => (l.hit >= 0.58 && near(l)) || (l.dir === "under" && underTypes.has(l.market) && l.hit >= 0.55)), { score: (l) => l.hit - implied(l.odds) });
  report("C. High confidence 60%+", main.filter((l) => l.hit >= 0.6));
  report("D. Unders + favorites", main.filter((l) => (l.dir === "under" && l.hit >= 0.54) || (l.market === "moneyline" && l.odds < 0 && l.hit >= 0.6)));
  report("E. Original, max 2 per game", main.filter((l) => l.hit >= 0.52 && l.ev >= -0.03), { perGame: 2 });
  report("F. Edge-first, max 2 per game", main.filter((l) => (l.hit >= 0.58 && near(l)) || (l.dir === "under" && underTypes.has(l.market) && l.hit >= 0.55)), { perGame: 2, score: (l) => l.hit - implied(l.odds) });
  report("G. Lowered lines 80-88% only", legs.filter((l) => l.alt && l.hit >= 0.8 && l.hit <= 0.88));
  report("H. Mix: 18 lowered + 7 edge legs", [...legs.filter((l) => l.alt && l.hit >= 0.8 && l.hit <= 0.88), ...main.filter((l) => l.hit >= 0.58 && near(l))], { score: (l) => Math.log(l.hit) + (l.alt ? 0 : 0.35) });
  report("J. Max 2 per game, near-even odds", main.filter((l) => l.hit >= 0.52 && l.ev >= -0.03 && near(l)), { perGame: 2 });
  report("K. Max 2/game, 55%+ only", main.filter((l) => l.hit >= 0.55 && l.ev >= -0.03), { perGame: 2 });
  // Payout-targeted: balance hit chance against odds (lambda) across main and lowered lines.
  const all = legs.filter((l) => !l.alt || (l.hit >= 0.7 && l.hit <= 0.92));
  for (const lam of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    report(`T. Target mix, lambda ${lam}`, all.filter((l) => l.alt || (l.hit >= 0.52 && l.ev >= -0.03)), { perGame: 3, score: (l) => Math.log(l.hit) + lam * Math.log(decimalOf(l.odds)) });
  }
  report("I. Lowered lines 75-85% (more payout)", legs.filter((l) => l.alt && l.hit >= 0.75 && l.hit <= 0.85));
})();
