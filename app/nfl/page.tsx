import Link from "next/link";
import AllSportsFreePicksBoard from "@/app/components/AllSportsFreePicksBoard";
import {
  NFL_MODEL_READINESS_TRACKS,
  NFL_PROP_CATEGORY_LABELS,
  NFL_PROP_MARKETS,
  NFL_TEAM_MARKETS,
  type NflPropCategoryKey,
} from "@/lib/nflMarkets";

function getMarketsByCategory(category: NflPropCategoryKey) {
  return NFL_PROP_MARKETS.filter((market) => market.category === category);
}

const boardCards = [
  {
    title: "Team Top Picks",
    subtitle: "Cleanest NFL team spots across moneyline, spread, and totals.",
    tone: "text-emerald-900 border-emerald-700/15 bg-emerald-600/10",
    markets: ["Moneyline", "Spread", "Game Total", "Home Team Total", "Away Team Total"],
  },
  {
    title: "Team Best Value",
    subtitle: "Price-first NFL team looks after the top lane is taken out.",
    tone: "text-sky-900 border-sky-700/15 bg-sky-600/10",
    markets: ["Moneyline", "Spread", "Game Total", "Home Team Total", "Away Team Total"],
  },
  {
    title: "Prop Top Picks",
    subtitle: "Best overall NFL player props across passing, rushing, receiving, and more.",
    tone: "text-emerald-900 border-emerald-700/15 bg-emerald-600/10",
    markets: ["Passing", "Rushing", "Receiving", "Combo", "Scoring", "Kicking", "Defense"],
  },
  {
    title: "Prop Best Value",
    subtitle: "Best remaining NFL player prices after the top prop lane is taken out.",
    tone: "text-sky-900 border-sky-700/15 bg-sky-600/10",
    markets: ["Passing", "Rushing", "Receiving", "Combo", "Scoring", "Kicking", "Defense"],
  },
] as const;

export default function NflPage() {
  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="app-eyebrow">NFL prep mode</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">NFL Board</h1>
        <p className="mt-3 max-w-3xl text-base text-slate-600">
          We&apos;re getting the full NFL board ready now so team bets, player props, roster context,
          rookie adjustments, and tactical matchup reads all have a real home before the season starts.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/performance?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
            NFL performance view
          </Link>
          <Link href="/calendar?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
            NFL calendar view
          </Link>
        </div>
      </section>

      <AllSportsFreePicksBoard />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 mb-8">
        {boardCards.map((card) => (
          <div key={card.title} className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
            <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${card.tone}`}>
              Setup ready
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.subtitle}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {card.markets.map((market) => (
                <div
                  key={market}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                >
                  {market}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
              Featured picks will start showing up here once we plug the NFL slate, roster context, and prop feed into the board.
            </div>
          </div>
        ))}
      </section>

      <section className="mb-8 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
        <h2 className="text-2xl font-semibold text-slate-950">Team Market Pool</h2>
        <p className="mt-2 text-sm text-slate-600">
          The NFL team board is set to pull from the core markets you called out, including home and away team totals.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {NFL_TEAM_MARKETS.map((market) => (
            <div
              key={market.key}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              {market.label}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
        <h2 className="text-2xl font-semibold text-slate-950">Player Prop Pool</h2>
        <p className="mt-2 text-sm text-slate-600">
          We&apos;re starting the NFL prop universe with the popular lanes that actually matter on Sundays, prime time, and playoff slates.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(NFL_PROP_CATEGORY_LABELS) as NflPropCategoryKey[]).map((category) => {
            const markets = getMarketsByCategory(category);
            return (
              <div key={category} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {NFL_PROP_CATEGORY_LABELS[category]}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {markets.map((market) => (
                    <div
                      key={market.key}
                      className="rounded-full border border-white bg-white px-3 py-1 text-sm font-medium text-slate-700"
                    >
                      {market.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
        <h2 className="text-2xl font-semibold text-slate-950">What We Build Next</h2>
        <p className="mt-2 text-sm text-slate-600">
          The next pass is where the NFL board stops being a shell and starts behaving like a real model.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {NFL_MODEL_READINESS_TRACKS.map((track) => (
            <div key={track.title} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{track.title}</h3>
              <div className="mt-4 space-y-2">
                {track.items.map((item) => (
                  <div key={item} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
