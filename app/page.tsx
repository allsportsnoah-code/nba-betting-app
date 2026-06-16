import Link from "next/link";
import AllSportsFreePicksBoard from "@/app/components/AllSportsFreePicksBoard";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="app-card mb-8 grid gap-8 rounded-[2rem] p-8 md:p-10 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="max-w-4xl">
          <div className="app-eyebrow mb-4">Daily models, frozen history, live review</div>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
            A sharper home for the boards we actually trust.
          </h1>
          <p className="mb-8 max-w-3xl text-lg text-slate-600 md:text-xl">
            Move between NBA, MLB, NFL, and Soccer, keep the official board history frozen, and make model changes without losing the trail that teaches us what is working.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="app-button app-button-primary inline-flex items-center justify-center">
              Open NBA
            </Link>
            <Link href="/mlb" className="app-button app-button-secondary inline-flex items-center justify-center">
              Open MLB
            </Link>
            <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">
              Open NFL
            </Link>
            <Link href="/soccer" className="app-button app-button-secondary inline-flex items-center justify-center">
              Open Soccer
            </Link>
          </div>
        </div>

        <div className="grid gap-3 self-start">
          <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">What stays intact</div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>Official picks stay frozen unless we explicitly repair a date.</p>
              <p>Sync, grading, and learning stay tied to the same boards you are already using.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/72 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">NBA</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Playoff board</div>
              <p className="mt-1 text-sm text-slate-600">Mixed team markets, props, injury checks.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/72 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">MLB</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Daily slate</div>
              <p className="mt-1 text-sm text-slate-600">Frozen boards, lineup-aware props, learning guardrails.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/72 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">NFL</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Ready to build</div>
              <p className="mt-1 text-sm text-slate-600">Team totals, props, roster context, rookies, roles.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/72 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Soccer</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">World Cup first</div>
              <p className="mt-1 text-sm text-slate-600">Tournament form, player chemistry, coaches, MLS support.</p>
            </div>
          </div>
        </div>
      </section>

      <AllSportsFreePicksBoard />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <Link href="/dashboard" className="app-card rounded-3xl p-7 hover:-translate-y-0.5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800/80 mb-3">
            NBA
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">NBA Dashboard</h2>
          <p className="mt-2 text-slate-600">Open the NBA picks, odds, and model view.</p>
        </Link>

        <Link href="/mlb" className="app-card rounded-3xl p-7 hover:-translate-y-0.5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-800/80 mb-3">
            MLB
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">MLB Dashboard</h2>
          <p className="mt-2 text-slate-600">Open the MLB model page and keep building baseball projections.</p>
        </Link>

        <Link href="/nfl" className="app-card rounded-3xl p-7 hover:-translate-y-0.5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800/80 mb-3">
            NFL
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">NFL Board</h2>
          <p className="mt-2 text-slate-600">Set up the NFL team and prop universe before the season gets going.</p>
        </Link>

        <Link href="/soccer" className="app-card rounded-3xl p-7 hover:-translate-y-0.5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800/80 mb-3">
            Soccer
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">Soccer Board</h2>
          <p className="mt-2 text-slate-600">Build World Cup and MLS signals from old tournaments, player roles, chemistry, and coaches.</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link href="/dashboard" className="app-card rounded-3xl p-6 hover:-translate-y-0.5">
          <h2 className="text-2xl font-semibold text-slate-950">Dashboard</h2>
          <p className="mt-2 text-slate-600">View today&apos;s NBA games and odds.</p>
        </Link>

        <Link href="/props" className="app-card rounded-3xl p-6 hover:-translate-y-0.5">
          <h2 className="text-2xl font-semibold text-slate-950">Player Props</h2>
          <p className="mt-2 text-slate-600">Find edges in player props.</p>
        </Link>

        <Link href="/live" className="app-card rounded-3xl p-6 hover:-translate-y-0.5">
          <h2 className="text-2xl font-semibold text-slate-950">Live Betting</h2>
          <p className="mt-2 text-slate-600">Track live opportunities.</p>
        </Link>

        <Link href="/picks" className="app-card rounded-3xl p-6 hover:-translate-y-0.5">
          <h2 className="text-2xl font-semibold text-slate-950">Pick Tracker</h2>
          <p className="mt-2 text-slate-600">Track your bets and performance.</p>
        </Link>

        <Link
          href="/assistant"
          className="app-card rounded-3xl p-6 hover:-translate-y-0.5 md:col-span-2"
        >
          <h2 className="text-2xl font-semibold text-slate-950">AI Assistant</h2>
          <p className="mt-2 text-slate-600">Ask questions about bets, injuries, and strategy.</p>
        </Link>
      </div>
    </main>
  );
}
