// Open-Meteo API (free, no key) for NFL outdoor stadium weather.
// Dome/retractable-roof stadiums are excluded — weather is irrelevant there.

export type GameWeather = {
  stadiumName: string;
  tempF: number;
  windMph: number;
  windGustsMph: number;
  precipPct: number;
  conditions: string; // short human-readable label
  isAdverse: boolean;  // wind > 15 or precip > 50% or temp < 30 — affects picks
  affectsTotals: boolean; // wind > 20 or precip > 65% — strong enough to push totals under
};

// Outdoor NFL stadiums — lat/lon for game-time weather fetch.
// Dome and fully-retractable-roof stadiums are intentionally omitted.
const OUTDOOR_STADIUMS: Record<string, { lat: number; lon: number; name: string }> = {
  "Buffalo Bills":          { lat: 42.7738, lon: -78.7870, name: "Highmark Stadium" },
  "Cleveland Browns":       { lat: 41.5060, lon: -81.6995, name: "Huntington Bank Field" },
  "Pittsburgh Steelers":    { lat: 40.4468, lon: -80.0158, name: "Acrisure Stadium" },
  "Cincinnati Bengals":     { lat: 39.0953, lon: -84.5161, name: "Paycor Stadium" },
  "Baltimore Ravens":       { lat: 39.2779, lon: -76.6227, name: "M&T Bank Stadium" },
  "Philadelphia Eagles":    { lat: 39.9007, lon: -75.1675, name: "Lincoln Financial Field" },
  "Washington Commanders":  { lat: 38.9078, lon: -76.8645, name: "Northwest Stadium" },
  "New York Giants":        { lat: 40.8135, lon: -74.0745, name: "MetLife Stadium" },
  "New York Jets":          { lat: 40.8135, lon: -74.0745, name: "MetLife Stadium" },
  "New England Patriots":   { lat: 42.0909, lon: -71.2643, name: "Gillette Stadium" },
  "Green Bay Packers":      { lat: 44.5013, lon: -88.0622, name: "Lambeau Field" },
  "Chicago Bears":          { lat: 41.8623, lon: -87.6167, name: "Soldier Field" },
  "Kansas City Chiefs":     { lat: 39.0490, lon: -94.4840, name: "GEHA Field at Arrowhead" },
  "Denver Broncos":         { lat: 39.7439, lon: -105.0201, name: "Empower Field at Mile High" },
  "Tennessee Titans":       { lat: 36.1665, lon: -86.7713, name: "Nissan Stadium" },
  "Jacksonville Jaguars":   { lat: 30.3240, lon: -81.6373, name: "EverBank Stadium" },
  "Miami Dolphins":         { lat: 25.9580, lon: -80.2389, name: "Hard Rock Stadium" },
  "Carolina Panthers":      { lat: 35.2258, lon: -80.8528, name: "Bank of America Stadium" },
  "Seattle Seahawks":       { lat: 47.5952, lon: -122.3316, name: "Lumen Field" },
  "San Francisco 49ers":    { lat: 37.4033, lon: -121.9694, name: "Levi's Stadium" },
  // SoFi has a fixed roof but open sides — wind and cold still penetrate
  "Los Angeles Rams":       { lat: 33.9534, lon: -118.3392, name: "SoFi Stadium" },
  "Los Angeles Chargers":   { lat: 33.9534, lon: -118.3392, name: "SoFi Stadium" },
  "Tampa Bay Buccaneers":   { lat: 27.9759, lon: -82.5033, name: "Raymond James Stadium" },
};

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    windspeed_10m?: number[];
    windgusts_10m?: number[];
  };
};

function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

function describeConditions(tempF: number, windMph: number, precipPct: number): string {
  const parts: string[] = [];
  if (precipPct >= 70) parts.push("heavy rain likely");
  else if (precipPct >= 40) parts.push("rain possible");
  if (windMph >= 25) parts.push(`strong wind ${windMph} mph`);
  else if (windMph >= 15) parts.push(`windy ${windMph} mph`);
  if (tempF <= 20) parts.push(`frigid ${tempF}°F`);
  else if (tempF <= 32) parts.push(`freezing ${tempF}°F`);
  else if (tempF <= 40) parts.push(`cold ${tempF}°F`);
  if (parts.length === 0) return `Clear, ${tempF}°F, wind ${windMph} mph`;
  return parts.join(", ");
}

export function isOutdoorGame(homeTeam: string): boolean {
  return homeTeam in OUTDOOR_STADIUMS;
}

export async function fetchGameWeather(
  homeTeam: string,
  gameTime: string // ISO 8601, e.g. "2026-09-21T18:00:00Z"
): Promise<GameWeather | null> {
  const stadium = OUTDOOR_STADIUMS[homeTeam];
  if (!stadium) return null; // dome or unknown — no weather needed

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(stadium.lat));
    url.searchParams.set("longitude", String(stadium.lon));
    url.searchParams.set("hourly", "temperature_2m,precipitation_probability,windspeed_10m,windgusts_10m");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "7");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as OpenMeteoResponse;
    const hourly = json?.hourly;
    if (!hourly?.time?.length) return null;

    // Match the nearest hour to game start time
    const gameDate = new Date(gameTime);
    const gameHourStr = gameDate.toISOString().slice(0, 13); // "2026-09-21T18"
    let idx = hourly.time.findIndex((t) => t.startsWith(gameHourStr));
    if (idx === -1) {
      // Fallback: find nearest future hour
      const gameMs = gameDate.getTime();
      idx = hourly.time.reduce((best, t, i) => {
        const diff = Math.abs(new Date(t).getTime() - gameMs);
        const bestDiff = Math.abs(new Date(hourly.time![best]).getTime() - gameMs);
        return diff < bestDiff ? i : best;
      }, 0);
    }

    const tempC = hourly.temperature_2m?.[idx] ?? 20;
    const windKmh = hourly.windspeed_10m?.[idx] ?? 0;
    const gustsKmh = hourly.windgusts_10m?.[idx] ?? 0;
    const precipPct = hourly.precipitation_probability?.[idx] ?? 0;

    const tempF = celsiusToFahrenheit(tempC);
    const windMph = kmhToMph(windKmh);
    const windGustsMph = kmhToMph(gustsKmh);

    const isAdverse = windMph > 15 || precipPct > 50 || tempF < 30;
    const affectsTotals = windMph > 20 || precipPct > 65 || tempF < 25;

    return {
      stadiumName: stadium.name,
      tempF,
      windMph,
      windGustsMph,
      precipPct,
      conditions: describeConditions(tempF, windMph, precipPct),
      isAdverse,
      affectsTotals,
    };
  } catch {
    return null;
  }
}
