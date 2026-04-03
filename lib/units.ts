export function americanToProfitPerUnit(odds: number): number {
  if (odds > 0) return odds / 100;
  return 100 / Math.abs(odds);
}

export function settleUnits(
  odds: number,
  stakeUnits: number,
  status: "win" | "loss" | "push"
): number {
  if (status === "push") return 0;
  if (status === "loss") return -stakeUnits;
  return Number((americanToProfitPerUnit(odds) * stakeUnits).toFixed(2));
}