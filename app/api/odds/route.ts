import { NextRequest, NextResponse } from "next/server";

const SPORT_CONFIG: Record<
  string,
  {
    oddsApiKey: string;
    markets: string;
  }
> = {
  NBA: {
    oddsApiKey: "basketball_nba",
    markets: "h2h,spreads,totals",
  },
  MLB: {
    oddsApiKey: "baseball_mlb",
    markets: "h2h,spreads,totals",
  },
};

function getEasternNow() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

function getEtOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

  if (!match) return -300;

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function etDateTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getEtOffsetMinutes(approxUtc);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toApiIso(date: Date) {
  return date.toISOString().replace(".000Z", "Z");
}

function getBusinessWindow(dayParam: string | null) {
  const et = getEasternNow();

  let anchor = new Date(Date.UTC(et.year, et.month - 1, et.day, 12, 0, 0));

  if (et.hour < 5) {
    anchor = addDays(anchor, -1);
  }

  if (dayParam === "tomorrow") {
    anchor = addDays(anchor, 1);
  }

  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + 1;
  const day = anchor.getUTCDate();

  const next = addDays(anchor, 1);
  const nextYear = next.getUTCFullYear();
  const nextMonth = next.getUTCMonth() + 1;
  const nextDay = next.getUTCDate();

  const startUtc = etDateTimeToUtc(year, month, day, 5, 0, 0);
  const endUtc = new Date(etDateTimeToUtc(nextYear, nextMonth, nextDay, 5, 0, 0).getTime() - 1000);

  return {
    startIso: toApiIso(startUtc),
    endIso: toApiIso(endUtc),
    label: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const day = req.nextUrl.searchParams.get("day");
    const sport = req.nextUrl.searchParams.get("sport") === "MLB" ? "MLB" : "NBA";
    const config = SPORT_CONFIG[sport];
    const window = getBusinessWindow(day);

    const url =
      `https://api.the-odds-api.com/v4/sports/${config.oddsApiKey}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&markets=${config.markets}` +
      `&oddsFormat=american` +
      `&bookmakers=draftkings` +
      `&commenceTimeFrom=${encodeURIComponent(window.startIso)}` +
      `&commenceTimeTo=${encodeURIComponent(window.endIso)}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Odds API failed: ${res.status}`,
          details: text,
          startIso: window.startIso,
          endIso: window.endIso,
          url,
        },
        { status: 500 }
      );
    }

    const data = JSON.parse(text);

    return NextResponse.json({
      ok: true,
      sport,
      day: day ?? "today",
      businessDate: window.label,
      startIso: window.startIso,
      endIso: window.endIso,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
