type TeamContext = {
  offRating: number;
  defRating: number;
  restDays: number;
  injuryAdjustment: number;
  homeCourt: number;
};

export function projectHomeMargin(home: TeamContext, away: TeamContext): number {
  const homeStrength =
    home.offRating - home.defRating + home.homeCourt + home.restDays * 0.4 + home.injuryAdjustment;

  const awayStrength =
    away.offRating - away.defRating + away.restDays * 0.4 + away.injuryAdjustment;

  return Number((homeStrength - awayStrength).toFixed(1));
}

export function projectHomeSpread(home: TeamContext, away: TeamContext): number {
  const margin = projectHomeMargin(home, away);
  return Number((-margin).toFixed(1));
}