import Link from "next/link";
import {
  listNbaParlayDates,
  listNbaSetsDates,
  loadNbaParlayDay,
  loadNbaSetsDay,
  loadNbaSetsResults,
  type NbaGameSet,
  type NbaParlayLeg,
  type NbaSetLeg,
  type NbaTicketResult,
  isDkLeg,
} from "@/lib/nbaParlays";

export const dynamic = "force-dynamic";

// Read-only view of data/picks/nba-parlays-<date>.json and nba-sets-<date>.json (npm run build:nba-parlays writes them),
// plus nba-sets-<date>.results.json grades (npm run grade:nba-parlays).
// Only the current builds are shown; `history` / `onePerGameHistory` entries are earlier builds and never displayed as current.

function fmtOdds(odds: number) {
  return odds > 0 ? `+${odds}` : String(odds);
}
function oneIn(p: number) {
  return Math.round(1 / Math.max(p, 1e-12)).toLocaleString("en-US");
}
function money(x: number) {
  return `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}
function todayEt(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function tipLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
}
function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

/** FanDuel lines first; DraftKings (via ESPN) only where FanDuel had none. Older files are all DraftKings. */
function DkBadge({ legs }: { legs: { book?: string }[] }) {
  if (!legs.length) return null;
  const dk = legs.filter(isDkLeg).length;
  if (!dk) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">FanDuel lines</span>;
  return (
    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
      {dk === legs.length ? "DK lines" : `${dk} DK line${dk === 1 ? "" : "s"}`}: check FanDuel
    </span>
  );
}

/** Marks a single DraftKings leg in a set that is otherwise FanDuel. */
function DkTag({ l }: { l: { book?: string } }) {
  return l.book === "draftkings" ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">DK: check FanDuel</span> : null;
}

function LegRow({ l, rank }: { l: NbaParlayLeg; rank?: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      {rank != null && <span className="w-6 text-right font-mono text-xs text-slate-400">{rank}</span>}
      <span className="w-20 text-xs text-slate-500">{tipLabel(l.startTime)}</span>
      <span className="font-medium text-slate-900">{l.pick}</span>
      <span className="text-xs text-slate-400">{l.game}</span>
      <DkTag l={l} />
      <span className="ml-auto font-mono text-xs text-slate-500">
        {fmtOdds(l.price)} · {pct(l.hitProb)}
      </span>
    </li>
  );
}

const RESULT_TONE: Record<string, string> = {
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
  push: "bg-slate-100 text-slate-600",
  void: "bg-slate-100 text-slate-500",
  ungradable: "bg-slate-100 text-slate-500",
  pending: "bg-amber-50 text-amber-700",
};

function ResultBadge({ status, title }: { status: string; title?: string }) {
  return (
    <span title={title} className={`rounded-full px-2 py-0.5 text-center text-xs font-semibold ${RESULT_TONE[status] ?? RESULT_TONE.pending}`}>
      {status.toUpperCase()}
    </span>
  );
}

function TicketBadge({ r }: { r: NbaTicketResult | null | undefined }) {
  if (!r) return null;
  const detail = `${r.won} won · ${r.lost} lost${r.void ? ` · ${r.void} void` : ""}${r.pending ? ` · ${r.pending} pending` : ""}`;
  return (
    <span className="flex items-center gap-2">
      <ResultBadge status={r.status} />
      <span className="text-xs text-slate-500">{detail}</span>
      {r.oddsIfWon != null && <span className="text-xs font-semibold text-emerald-700">paid {r.oddsIfWon}x</span>}
    </span>
  );
}

/** A leg's graded result: same position in the results file, or failing that the same pick text. */
function legResult(r: NbaTicketResult | null | undefined, leg: NbaSetLeg, i: number) {
  if (!r) return undefined;
  const hit = r.legs[i]?.pick === leg.pick ? r.legs[i] : r.legs.find((x) => x.pick === leg.pick);
  return hit?.result;
}

function hitPct(p: number) {
  return p >= 0.1 ? pct(p) : `${(p * 100).toFixed(1)}%`;
}

function SetLegRow({ l, result, showGame = false }: { l: NbaSetLeg; result?: NbaTicketResult["legs"][number]["result"]; showGame?: boolean }) {
  const note = result ? [result.actual != null ? `actual ${result.actual}` : null, result.note].filter(Boolean).join(" · ") : "";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      {result && <ResultBadge status={result.status} />}
      {showGame && <span className="w-20 text-xs text-slate-500">{tipLabel(l.startTime)}</span>}
      <span className="font-medium text-slate-900">{l.pick}</span>
      {showGame && <span className="text-xs text-slate-400">{l.game}</span>}
      {l.loweredFrom && <span className="text-xs text-amber-700">lowered from {l.loweredFrom}</span>}
      <DkTag l={l} />
      {note && <span className="text-xs text-slate-400">{note}</span>}
      <span className="ml-auto font-mono text-xs text-slate-500">
        {fmtOdds(l.price)} · {pct(l.hitProb)}
      </span>
    </li>
  );
}

function GameSetView({ set, results, open }: { set: NbaGameSet; results: NbaTicketResult[] | undefined; open: boolean }) {
  const count = (s: string) => results?.filter((r) => r.status === s).length ?? 0;
  return (
    <details className="rounded-2xl border border-slate-200 bg-white/70" open={open}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-950">{set.label}</span>
        <span className="text-slate-500">{tipLabel(set.startTime)}</span>
        <span className="text-slate-500">
          {set.tickets.length} tickets of {set.legsPerTicket}
        </span>
        {set.tickets[0] && (
          <span className="font-mono text-slate-700">
            ticket 1: {set.tickets[0].odds}x · hits {hitPct(set.tickets[0].hitChance)}
          </span>
        )}
        {results && (
          <span className="text-xs text-slate-500">
            {count("won")} cashed · {count("lost")} lost · {count("pending")} pending
          </span>
        )}
      </summary>
      <div className="space-y-2 p-2">
        {set.tickets.map((t, i) => {
          const r = results?.[i];
          return (
            <details key={i} className="rounded-2xl border border-slate-200 bg-white" open={i === 0}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-950">Ticket {i + 1}</span>
                <span className="font-mono font-semibold text-slate-900">{t.odds}x</span>
                <span className="text-slate-700">hits {hitPct(t.hitChance)}</span>
                {i > 0 && (
                  <span className="text-slate-500">
                    shares {t.sharesWithTicket1} of {t.legs.length} with ticket 1
                  </span>
                )}
                {t.lowered > 0 && <span className="text-xs text-amber-700">{t.lowered} lowered</span>}
                <TicketBadge r={r} />
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {t.legs.map((l, j) => (
                  <SetLegRow key={`${l.pick}-${j}`} l={l} result={legResult(r, l, j)} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </details>
  );
}

export default async function NbaParlaysPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const params = await searchParams;
  const today = todayEt();
  const asked = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const date = asked ?? today;
  const dates = [...new Set([...listNbaParlayDates(), ...listNbaSetsDates(), today])].sort().reverse();
  const day = loadNbaParlayDay(date);
  const t = day?.ticket;
  const legs = t ? [...t.legs].sort((a, b) => a.startTime.localeCompare(b.startTime) || b.hitProb - a.hitProb) : [];
  const topPicks = day ? [...day.topPicks].sort((a, b) => b.hitProb - a.hitProb) : [];

  const sets = loadNbaSetsDay(date);
  const setResults = sets ? loadNbaSetsResults(date) : null;
  const one = sets?.onePerGame ?? null;
  // Keep each leg's saved index so it still lines up with the results file after sorting by tip.
  const oneLegs = one ? one.legs.map((l, i) => ({ l, i })).sort((a, b) => a.l.startTime.localeCompare(b.l.startTime)) : [];
  const gameSets = sets ? Object.values(sets.games).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.label.localeCompare(b.label)) : [];
  const nowMs = Date.now();
  const nextGame = gameSets.findIndex((g) => new Date(g.startTime).getTime() > nowMs);

  const setsView = sets ? (
    <>
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="app-eyebrow flex flex-wrap items-center gap-2">
              {one ? `${one.legs.length} legs · one per game` : "not built"} <DkBadge legs={one?.legs ?? []} />
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">One pick per game</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              The likeliest pick from each game, sorted by tip time. Odds are the plain product of the legs; FanDuel prices same-game parlays lower.
            </p>
          </div>
          {one && (
            <div className="flex flex-wrap items-center gap-3">
              <TicketBadge r={setResults?.onePerGame} />
              <div className="rounded-2xl bg-slate-900 px-4 py-2 text-white">
                <div className="text-[0.65rem] uppercase tracking-[0.12em] text-slate-300">Hits about</div>
                <div className="text-lg font-semibold">{hitPct(one.hitChance)}</div>
                <div className="text-xs text-slate-300">
                  {fmtOdds(one.american)} · pays {one.odds}x
                </div>
              </div>
            </div>
          )}
        </div>
        {one ? (
          <ul className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {oneLegs.map(({ l, i }) => (
              <SetLegRow key={`${l.pick}-${i}`} l={l} result={legResult(setResults?.onePerGame, l, i)} showGame />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No one-pick-per-game ticket saved for this date.</p>
        )}
      </section>

      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="app-eyebrow flex flex-wrap items-center gap-2">
          {gameSets.length} games <DkBadge legs={gameSets.flatMap((g) => g.tickets.flatMap((tk) => tk.legs))} />
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Single-game sets</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Each game&apos;s own tickets, sorted by tip. Ticket 1 is the game&apos;s strongest legs; later tickets swap a little more. A game is missing
          when there weren&apos;t enough props yet.
        </p>
        <p className="mt-1 text-xs text-slate-500">Odds are the plain product of the legs; FanDuel prices same-game parlays lower.</p>
        <div className="mt-4 space-y-2">
          {gameSets.map((g, i) => (
            <GameSetView key={g.gameId} set={g} results={setResults?.games[g.gameId]?.tickets} open={i === Math.max(nextGame, 0)} />
          ))}
        </div>
        {setResults && (
          <p className="mt-3 text-xs text-slate-500">
            Graded{" "}
            {new Date(setResults.gradedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET.
          </p>
        )}
      </section>
    </>
  ) : null;

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="max-w-3xl">
          <div className="app-eyebrow">NBA Parlays — {dateLabel(date)}</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Daily 25-Leg Longshot</h1>
          <p className="mt-3 text-base text-slate-600">
            One 25-leg ticket a day plus the top single picks, ranked by how likely each is to hit. The ticket is a long shot, not a best bet.
          </p>
          <form method="get" action="/nba/parlays" className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="nba-date" className="text-slate-500">Date:</label>
            <input
              id="nba-date"
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-800"
            />
            <button type="submit" className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-white">Go</button>
            {dates.map((d) => (
              <Link
                key={d}
                href={d === today ? "/nba/parlays" : `/nba/parlays?date=${d}`}
                className={`rounded-full border px-3 py-1 ${d === date ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {dateLabel(d)}{d === today ? " (today)" : ""}
              </Link>
            ))}
          </form>
          {day && (
            <p className="mt-3 text-sm text-slate-500">
              Built {new Date(day.builtAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET · {day.source} ·{" "}
              {day.games.length} games · {day.poolSize.toLocaleString("en-US")} lines in the pool. Shown exactly as saved.
            </p>
          )}
        </div>
      </section>

      {!day || !t ? (
        <p className="mb-8 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-600">
          No saved NBA 25-leg parlay for {dateLabel(date)}. Run <code>npm run build:nba-parlays</code> to build one.
        </p>
      ) : (
        <>
          <section className="app-card mb-8 rounded-[2rem] p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="app-eyebrow flex flex-wrap items-center gap-2">
                  {legs.length} legs · at most {t.maxPerGame} per game <DkBadge legs={legs} />
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">The ticket</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Sorted by tip time. Average leg hits {pct(t.avgLegHit)} of the time. Any line marked DK is DraftKings&apos; (via ESPN, where FanDuel had none), so check it on FanDuel before placing.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl bg-slate-900 px-4 py-2 text-white">
                  <div className="text-[0.65rem] uppercase tracking-[0.12em] text-slate-300">Odds of hitting</div>
                  <div className="text-lg font-semibold">1 in {oneIn(t.hitChance)}</div>
                </div>
                <div className="rounded-2xl bg-slate-100 px-4 py-2 text-slate-900">
                  <div className="text-[0.65rem] uppercase tracking-[0.12em] text-slate-500">{money(t.stake)} stake · FanDuel estimate</div>
                  <div className="text-lg font-semibold">{money(t.fanduelEstimate)}</div>
                  <div className="text-[10px] text-slate-500">raw product {money(t.rawPayout)} (÷{t.haircutFactor} for FanDuel&apos;s parlay pricing)</div>
                </div>
              </div>
            </div>
            <ul className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {legs.map((l, i) => (
                <LegRow key={`${l.game}-${l.pick}-${i}`} l={l} />
              ))}
            </ul>
          </section>
        </>
      )}

      {setsView}

      {day && (
        <>
          <section className="app-card mb-8 rounded-[2rem] p-6">
            <div className="app-eyebrow flex flex-wrap items-center gap-2">
              {topPicks.length} picks <DkBadge legs={topPicks} />
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Top single picks</h2>
            <p className="mt-1 text-sm text-slate-600">Ranked by hit chance, highest first.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Pick</th>
                    <th className="px-2 py-2">Game</th>
                    <th className="px-2 py-2">Tip</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    <th className="px-2 py-2 text-right">Hit %</th>
                    <th className="px-2 py-2 text-right">Market</th>
                    <th className="px-2 py-2 text-right">Proj.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topPicks.map((p, i) => (
                    <tr key={`${p.game}-${p.pick}-${i}`}>
                      <td className="px-2 py-2 font-mono text-xs text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2 font-medium text-slate-900">
                        {p.pick} <DkTag l={p} />
                      </td>
                      <td className="px-2 py-2 text-slate-500">{p.game}</td>
                      <td className="px-2 py-2 text-slate-500">{tipLabel(p.startTime)}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmtOdds(p.price)}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold">{pct(p.hitProb)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500">{pct(p.marketProb)}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500">{p.projection ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
