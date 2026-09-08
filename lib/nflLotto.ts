export const NFL_LOTTO_LEG_COUNT = 25;
export const NFL_LOTTO_STAKE = 0.1;
export const NFL_LOTTO_REDUCED_STAKE = 0.05;
export const NFL_LOTTO_PAYOUT_CAP = 999_999.99;
export const NFL_LOTTO_BENCHMARK_ODDS = -110;

export function americanToDecimal(american: number) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number) {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function getParlayReturn(params: {
  odds: number;
  legs?: number;
  stake?: number;
}) {
  const legs = params.legs ?? NFL_LOTTO_LEG_COUNT;
  const stake = params.stake ?? NFL_LOTTO_STAKE;
  return stake * americanToDecimal(params.odds) ** legs;
}

export function getMixedParlayMultiplier(odds: number[]) {
  return odds.reduce((multiplier, price) => multiplier * americanToDecimal(price), 1);
}

export function getMixedParlayReturn(params: {
  odds: number[];
  stake?: number;
}) {
  return (params.stake ?? NFL_LOTTO_STAKE) * getMixedParlayMultiplier(params.odds);
}

export function getRequiredAverageDecimal(params?: {
  targetReturn?: number;
  stake?: number;
  legs?: number;
}) {
  const targetReturn = params?.targetReturn ?? NFL_LOTTO_PAYOUT_CAP;
  const stake = params?.stake ?? NFL_LOTTO_STAKE;
  const legs = params?.legs ?? NFL_LOTTO_LEG_COUNT;
  return (targetReturn / stake) ** (1 / legs);
}

export function formatMoney(value: number) {
  const showsCents = value < 100 || Math.abs(value - NFL_LOTTO_PAYOUT_CAP) < 0.01;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showsCents ? 2 : 0,
    maximumFractionDigits: showsCents ? 2 : 0,
  }).format(value);
}

export function formatOdds(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatParlayOdds(multiplier: number) {
  const value = Math.round((multiplier - 1) * 100);
  return value > 0 ? `+${value.toLocaleString("en-US")}` : value.toLocaleString("en-US");
}

export function formatMultiplier(multiplier: number) {
  return `${Math.round(multiplier).toLocaleString("en-US")}x`;
}

export function formatStake(value: number) {
  if (value < 1) {
    const cents = value * 100;

    if (cents < 0.001) return "<0.001c";
    if (cents < 0.1) return `${cents.toFixed(3)}c`;
    if (cents < 1) return `${cents.toFixed(2)}c`;
    return `${cents.toFixed(1)}c`;
  }

  return formatMoney(value);
}

export function getOddsMixSummary(odds: number[]) {
  const counts = new Map<number, number>();
  odds.forEach((price) => counts.set(price, (counts.get(price) ?? 0) + 1));

  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([price, count]) => `${count}x ${formatOdds(price)}`)
    .join(", ");
}

export function formatOneIn(probability: number) {
  if (probability <= 0) return "n/a";

  return `1 in ${Math.round(1 / probability).toLocaleString("en-US")}`;
}

export function getMixedLottoStakePlan(odds: number[]) {
  const multiplier = getMixedParlayMultiplier(odds);
  const averageDecimal = multiplier ** (1 / odds.length);
  const tenCentReturn = NFL_LOTTO_STAKE * multiplier;
  const nickelReturn = NFL_LOTTO_REDUCED_STAKE * multiplier;
  const capSafeStake = NFL_LOTTO_PAYOUT_CAP / multiplier;
  const tenCentsFits = tenCentReturn <= NFL_LOTTO_PAYOUT_CAP;
  const nickelFits = nickelReturn <= NFL_LOTTO_PAYOUT_CAP;
  const recommendedStake = tenCentsFits
    ? NFL_LOTTO_STAKE
    : nickelFits
      ? NFL_LOTTO_REDUCED_STAKE
      : capSafeStake;

  return {
    multiplier,
    averageDecimal,
    averageOdds: decimalToAmerican(averageDecimal),
    tenCentReturn,
    nickelReturn,
    capSafeStake,
    recommendedStake,
    recommendedReturn: recommendedStake * multiplier,
    stakeStatus: tenCentsFits ? "$0.10 fits" : nickelFits ? "$0.05 fits" : "Below $0.05 needed",
  };
}

function getSameAveragePricePlan(odds: number) {
  const decimal = americanToDecimal(odds);
  const multiplier = decimal ** NFL_LOTTO_LEG_COUNT;
  const tenCentReturn = NFL_LOTTO_STAKE * multiplier;
  const nickelReturn = NFL_LOTTO_REDUCED_STAKE * multiplier;
  const capSafeStake = NFL_LOTTO_PAYOUT_CAP / multiplier;
  const stakeStatus =
    capSafeStake >= NFL_LOTTO_STAKE
      ? "$0.10 is under cap"
      : capSafeStake >= NFL_LOTTO_REDUCED_STAKE
        ? "$0.05 to cap zone"
        : "Below $0.05 needed";

  return {
    odds,
    decimal,
    multiplier,
    tenCentReturn,
    nickelReturn,
    capSafeStake,
    stakeStatus,
  };
}

const minus110Decimal = americanToDecimal(NFL_LOTTO_BENCHMARK_ODDS);
const minus110ImpliedProbability = 1 / minus110Decimal;
const singleTicketProbability = minus110ImpliedProbability ** NFL_LOTTO_LEG_COUNT;
const mirroredTicketProbability = minus110ImpliedProbability ** (NFL_LOTTO_LEG_COUNT - 1);
const twoIndependentTicketProbability = 1 - (1 - singleTicketProbability) ** 2;

export const NFL_LOTTO_PRICE_EXAMPLES = [-200, -150, -120, -110, -105, 100, 150, 200].map((odds) => {
  const plan = getSameAveragePricePlan(odds);
  return {
    ...plan,
    rawReturn: plan.tenCentReturn,
    displayedReturn: Math.min(plan.tenCentReturn, NFL_LOTTO_PAYOUT_CAP),
    capped: plan.tenCentReturn > NFL_LOTTO_PAYOUT_CAP,
  };
});

export const NFL_LOTTO_TARGET = {
  averageDecimal: getRequiredAverageDecimal(),
  averageOdds: decimalToAmerican(getRequiredAverageDecimal()),
  rawMinus110Return: getParlayReturn({ odds: NFL_LOTTO_BENCHMARK_ODDS }),
};

export const NFL_LOTTO_STRUCTURES = [
  {
    title: "One 25-leg ticket",
    cost: NFL_LOTTO_STAKE,
    hitCondition: "All 25 legs land",
    hitProbability: singleTicketProbability,
    upside: Math.min(getParlayReturn({ odds: -110 }), NFL_LOTTO_PAYOUT_CAP),
    note: "Cleanest ticket, but every leg is a knockout.",
  },
  {
    title: "Two mirrored tickets",
    cost: NFL_LOTTO_STAKE * 2,
    hitCondition: "The shared 24 land; one side of the mirror lands",
    hitProbability: mirroredTicketProbability,
    upside: NFL_LOTTO_PAYOUT_CAP,
    note: "Raw hit chance rises, but the stake doubles and 24 legs are still shared.",
  },
  {
    title: "Two independent tickets",
    cost: NFL_LOTTO_STAKE * 2,
    hitCondition: "Either separate 25-leg ticket lands",
    hitProbability: twoIndependentTicketProbability,
    upside: NFL_LOTTO_PAYOUT_CAP,
    note: "Usually a better use of the second dime unless one leg is truly too close to call.",
  },
];

export const NFL_LOTTO_COVERAGE_STRATEGIES = [1, 2, 3].map((coveredLegs) => {
  const ticketCount = 2 ** coveredLegs;
  const sharedLegs = NFL_LOTTO_LEG_COUNT - coveredLegs;
  const mirrorHitProbability = minus110ImpliedProbability ** sharedLegs;
  const differentTicketProbability = 1 - (1 - singleTicketProbability) ** ticketCount;

  return {
    coveredLegs,
    ticketCount,
    sharedLegs,
    costAtNickel: ticketCount * NFL_LOTTO_REDUCED_STAKE,
    mirrorHitProbability,
    differentTicketProbability,
    betterValue:
      differentTicketProbability >= mirrorHitProbability
        ? "Different tickets"
        : "Mirror coverage",
  };
});

export const NFL_LOTTO_RULES = [
  "For a mixed ticket, multiply all 25 decimal prices. The average odds row is only a quick estimate.",
  "If the dime is over the cap, a nickel can work when the average price is roughly -105 or more favorite-heavy.",
  "Mirroring 2 legs takes 4 tickets; mirroring 3 legs takes 8 tickets if you want every over/under combination covered.",
  "Best value is usually more distinct tickets, because mirrored tickets keep most legs shared and correlated.",
] as const;
