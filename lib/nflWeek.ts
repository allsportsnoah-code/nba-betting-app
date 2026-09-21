// NFL week 1 = first Tuesday of September of the current year (week reset is Tuesday)
// Weeks 1-18 = regular season, 19+ = playoffs

export type NflWeekInfo = {
  weekNum: number;          // 1-18 regular season, 19+ playoffs
  weekStart: string;        // YYYY-MM-DD (Tuesday)
  weekEnd: string;          // YYYY-MM-DD (Monday)
  label: string;            // "Week 1", "Wild Card", etc.
  isPlayoff: boolean;
};

const PLAYOFF_LABELS: Record<number, string> = {
  19: "Wild Card",
  20: "Divisional",
  21: "Conference",
  22: "Super Bowl",
};

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getSeasonYear(now = new Date()): number {
  const month = now.getUTCMonth() + 1; // 1-12
  // NFL season starts September, new year after Super Bowl (Feb)
  return month >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function getSeasonWeek1Start(year: number): Date {
  // NFL Week 1 starts the Tuesday after Labor Day (first Monday of September)
  const sep1 = new Date(Date.UTC(year, 8, 1));
  const dow = sep1.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue ...
  const daysToMon = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  const laborDay = new Date(sep1);
  laborDay.setUTCDate(sep1.getUTCDate() + daysToMon);
  // Week 1 is Tuesday through the following Monday
  const tue = new Date(laborDay);
  tue.setUTCDate(laborDay.getUTCDate() + 1);
  return tue;
}

export function getNflWeekInfo(weekStart: string, now = new Date()): NflWeekInfo {
  const year = getSeasonYear(now);
  const week1Start = getSeasonWeek1Start(year);

  const startDate = new Date(weekStart + "T00:00:00Z");
  const diffMs = startDate.getTime() - week1Start.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const weekNum = diffWeeks + 1;

  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  const isPlayoff = weekNum >= 19;
  const label = isPlayoff
    ? PLAYOFF_LABELS[weekNum] ?? `Postseason W${weekNum - 18}`
    : weekNum >= 1 && weekNum <= 18
    ? `Week ${weekNum}`
    : weekNum <= 0
    ? `Preseason W${Math.abs(weekNum) + 1}`
    : `Week ${weekNum}`;

  return {
    weekNum,
    weekStart,
    weekEnd: formatDate(endDate),
    label,
    isPlayoff,
  };
}

export function getAllNflWeeks(year: number): NflWeekInfo[] {
  const week1Start = getSeasonWeek1Start(year);
  const weeks: NflWeekInfo[] = [];
  for (let i = 0; i < 22; i++) {
    const start = new Date(week1Start);
    start.setUTCDate(week1Start.getUTCDate() + i * 7);
    const ws = formatDate(start);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const weekNum = i + 1;
    const isPlayoff = weekNum >= 19;
    weeks.push({
      weekNum,
      weekStart: ws,
      weekEnd: formatDate(end),
      label: isPlayoff
        ? PLAYOFF_LABELS[weekNum] ?? `Postseason W${weekNum - 18}`
        : `Week ${weekNum}`,
      isPlayoff,
    });
  }
  return weeks;
}

export function getCurrentNflWeek(now = new Date()): NflWeekInfo | null {
  const year = getSeasonYear(now);
  const week1Start = getSeasonWeek1Start(year);
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = nowUtc.getTime() - week1Start.getTime();
  if (diffMs < 0) return null; // preseason
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const start = new Date(week1Start);
  start.setUTCDate(week1Start.getUTCDate() + diffWeeks * 7);
  return getNflWeekInfo(formatDate(start), now);
}
