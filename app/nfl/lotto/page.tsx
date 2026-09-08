import Link from "next/link";
import {
  NFL_LOTTO_BENCHMARK_ODDS,
  NFL_LOTTO_COVERAGE_STRATEGIES,
  NFL_LOTTO_LEG_COUNT,
  NFL_LOTTO_PAYOUT_CAP,
  NFL_LOTTO_PRICE_EXAMPLES,
  NFL_LOTTO_REDUCED_STAKE,
  NFL_LOTTO_RULES,
  NFL_LOTTO_STAKE,
  NFL_LOTTO_TARGET,
  formatMoney,
  formatMultiplier,
  formatOdds,
  formatOneIn,
  formatParlayOdds,
  formatStake,
} from "@/lib/nflLotto";

export default function NflLottoPage() {
  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="app-panel mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="app-eyebrow">NFL lotto lane</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
              Million Ticket Builder
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A separate NFL workspace for 25-leg FanDuel-style lotto slips, mixed odds,
              nickel sizing, mirrored over/under coverage, and cap-aware ticket planning.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">
                NFL board
              </Link>
              <Link href="/nfl/lotto" className="app-button app-button-primary inline-flex items-center justify-center">
                Lotto builder
              </Link>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[34rem]">
            <div className="app-stat rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Legs</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{NFL_LOTTO_LEG_COUNT}</div>
            </div>
            <div className="app-stat rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Base</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(NFL_LOTTO_STAKE)}</div>
            </div>
            <div className="app-stat rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nickel</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(NFL_LOTTO_REDUCED_STAKE)}</div>
            </div>
            <div className="app-stat rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cap</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(NFL_LOTTO_PAYOUT_CAP)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="app-eyebrow">Stake to cap</div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">Average Odds Cap Planner</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              This table treats the 25-leg slip as if the average leg lands at the listed price,
              then shows the total parlay value and the stake needed to sit right under the cap.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
            Target average: {NFL_LOTTO_TARGET.averageDecimal.toFixed(3)} decimal, about{" "}
            {formatOdds(NFL_LOTTO_TARGET.averageOdds)}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[38rem] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Average odds</th>
                <th className="px-4 py-3">Total parlay + value</th>
                <th className="px-4 py-3">Amount for just under $1M</th>
              </tr>
            </thead>
            <tbody>
              {NFL_LOTTO_PRICE_EXAMPLES.map((example) => (
                <tr key={example.odds} className="border-t border-slate-200 text-slate-700">
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatOdds(example.odds)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">{formatParlayOdds(example.multiplier)}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatMultiplier(example.multiplier)}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatStake(example.capSafeStake)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="app-eyebrow">Best value</div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">Different Tickets vs Mirrored Legs</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Mirroring means covering every over/under combination for the chosen legs. One mirrored leg needs 2 tickets,
              two mirrored legs need 4, and three mirrored legs need 8.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
            Benchmark assumes {formatOdds(NFL_LOTTO_BENCHMARK_ODDS)} fair-pricing math.
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[56rem] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Mirror plan</th>
                <th className="px-4 py-3">Tickets needed</th>
                <th className="px-4 py-3">Shared legs to hit</th>
                <th className="px-4 py-3">Mirror chance</th>
                <th className="px-4 py-3">Same-count distinct tickets</th>
                <th className="px-4 py-3">Better value</th>
              </tr>
            </thead>
            <tbody>
              {NFL_LOTTO_COVERAGE_STRATEGIES.map((strategy) => (
                <tr key={strategy.coveredLegs} className="border-t border-slate-200 text-slate-700">
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    Cover {strategy.coveredLegs} over/under {strategy.coveredLegs === 1 ? "leg" : "legs"}
                  </td>
                  <td className="px-4 py-3">
                    {strategy.ticketCount} slips at nickel = {formatMoney(strategy.costAtNickel)}
                  </td>
                  <td className="px-4 py-3">{strategy.sharedLegs}</td>
                  <td className="px-4 py-3">{formatOneIn(strategy.mirrorHitProbability)}</td>
                  <td className="px-4 py-3">{formatOneIn(strategy.differentTicketProbability)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{strategy.betterValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-slate-50/80 p-4 text-sm leading-6 text-slate-700">
            Copying one slip and flipping 2 legs is not full coverage. Full 2-leg coverage requires 4 slips.
          </div>
          <div className="rounded-2xl border border-white/70 bg-slate-50/80 p-4 text-sm leading-6 text-slate-700">
            Mirroring lowers the number of shared legs you need right, but it keeps the remaining legs fully correlated.
          </div>
          <div className="rounded-2xl border border-white/70 bg-slate-50/80 p-4 text-sm leading-6 text-slate-700">
            On pure value, the same money usually works better as unrelated tickets instead of mirrored copies.
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {NFL_LOTTO_RULES.map((rule) => (
          <div key={rule} className="app-stat rounded-2xl p-4 text-sm leading-6 text-slate-700">
            {rule}
          </div>
        ))}
      </section>
    </main>
  );
}
