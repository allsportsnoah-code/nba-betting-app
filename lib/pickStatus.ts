export function resolvePickStatus(status: string | null | undefined) {
  if (!status) return "pending";
  return status === "postponed" || status === "voided" ? "push" : status;
}

export function getPickStatusLabel(status: string | null | undefined) {
  if (status === "voided") return "Voided";
  const resolvedStatus = resolvePickStatus(status);

  if (resolvedStatus === "pending") return "Pending";
  if (resolvedStatus === "win") return "Win";
  if (resolvedStatus === "loss") return "Loss";
  if (resolvedStatus === "push") return "Push";
  return resolvedStatus;
}

export function isPendingPickStatus(status: string | null | undefined) {
  return resolvePickStatus(status) === "pending";
}

export function isPostponedPickStatus(status: string | null | undefined) {
  return status === "postponed";
}
