import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto p-8">
      <section className="app-card rounded-[2rem] p-8 md:p-12 mb-8 overflow-hidden">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/80 px-3 py-1 text-sm font-medium text-teal-900 mb-4">
            Daily models, saved picks, and post-game review
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-slate-950 mb-4">
            Build sharper sports betting dashboards without the spreadsheet mess.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-2xl">
            Move between NBA and MLB, track top plays, review star ratings, and tune the model from real results.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-teal-700 px-5 py-3 font-medium text-white shadow-lg shadow-teal-900/15 hover:bg-teal-800"
            >
              Open NBA
            </Link>
            <Link
              href="/mlb"
              className="rounded-full border border-slate-300 bg-white/85 px-5 py-3 font-medium text-slate-900 hover:border-teal-700/30 hover:bg-white"
            >
              Open MLB
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
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
