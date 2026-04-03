import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { settleUnits } from "@/lib/units";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";

type PendingPick = {
  id: number;
  sport: string;
  market_scope: string | null;
  market_type: string | null;
  status: string | null;
  home_team: string | null;
  away_team: string | null;
  side: string | null;
  line_taken: number | null;
  odds_taken: number | null;
  stake_units: number | null;
  game_start_time: string | null;
};

type OddsScore = {
  name: string;
  score: string | number;
};

type CompletedGame = {
  completed: boolean;
  home_team: string;
  away_team: string;
  commence_time?: string;
  scores?: OddsScore[];
};

function normalizeTeamName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function gradeSpreadPick(params: {
  selectedTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
  lineTaken: number;
}) {
  const { selectedTeam, homeTeam, homeScore, awayScore, lineTaken } = params;

  const selectedIsHome = normalizeTeamName(selectedTeam) === normalizeTeamName(homeTeam);
  const selectedScore = selectedIsHome ? homeScore : awayScore;
  const opponentScore = selectedIsHome ? awayScore : homeScore;
  const resultValue = selectedScore - opponentScore + lineTaken;

  if (resultValue > 0) return "win" as const;
  if (resultValue < 0) return "loss" as const;
  return "push" as const;
}

function gradeMoneylinePick(params: {
  selectedTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
}) {
  const { selectedTeam, homeTeam, homeScore, awayScore } = params;

  const selectedIsHome = normalizeTeamName(selectedTeam) === normalizeTeamName(homeTeam);
  const selectedScore = selectedIsHome ? homeScore : awayScore;
  const opponentScore = selectedIsHome ? awayScore : homeScore;

  if (selectedScore > opponentScore) return "win" as const;
  if (selectedScore < opponentScore) return "loss" as const;
  return "push" as const;
}

function gradeTotalPick(params: {
  side: string;
  lineTaken: number;
  homeScore: number;
  awayScore: number;
}) {
  const totalScore = params.homeScore + params.awayScore;
  const wantsOver = params.side.trim().toLowerCase().startsWith("over");

  if (totalScore === params.lineTaken) return "push" as const;
  if (wantsOver) return totalScore > params.lineTaken ? "win" as const : "loss" as const;
  return totalScore < params.lineTaken ? "win" as const : "loss" as const;
}

function getSelectedTeamFromPick(pick: PendingPick) {
  const side = pick.side ?? "";
  const homeTeam = pick.home_team ?? "";
  const awayTeam = pick.away_team ?? "";

  if (normalizeTeamName(side).startsWith(normalizeTeamName(homeTeam))) return homeTeam;
  if (normalizeTeamName(side).startsWith(normalizeTeamName(awayTeam))) return awayTeam;

  return homeTeam;
}

function getGameScores(game: CompletedGame) {
  const homeScore = Number(
    game.scores?.find((score) => normalizeTeamName(score.name) === normalizeTeamName(game.home_team))
      ?.score
  );

  const awayScore = Number(
    game.scores?.find((score) => normalizeTeamName(score.name) === normalizeTeamName(game.away_team))
      ?.score
  );

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
  return { homeScore, awayScore };
}

async function fetchCompletedGames(sportKey: "basketball_nba" | "baseball_mlb", apiKey: string) {
  const scoresRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=3`,
    { cache: "no-store" }
  );

  const scoresText = await scoresRes.text();

  if (!scoresRes.ok) {
    throw new Error(`Scores API failed for ${sportKey}: ${scoresRes.status} ${scoresText}`);
  }

  const scoresData = JSON.parse(scoresText) as CompletedGame[];
  return (scoresData ?? []).filter(
    (game) => game.completed === true && Array.isArray(game.scores)
  );
}

function findMatchingGame(pick: PendingPick, completedGames: CompletedGame[]) {
  const teamMatches = completedGames.filter(
    (game) =>
      normalizeTeamName(game.home_team) === normalizeTeamName(pick.home_team) &&
      normalizeTeamName(game.away_team) === normalizeTeamName(pick.away_team)
  );

  if (teamMatches.length <= 1) return teamMatches[0];
  if (!pick.game_start_time) return teamMatches[0];

  const pickStart = new Date(pick.game_start_time).getTime();

  return teamMatches
    .map((game) => ({
      game,
      diff: Math.abs(
        pickStart - new Date(game.commence_time ?? pick.game_start_time ?? 0).getTime()
      ),
    }))
    .sort((a, b) => a.diff - b.diff)[0]?.game;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    const { data: pendingRows, error: pendingError } = await supabase
      .from("picks")
      .select("*")
      .in("sport", ["NBA", "MLB"])
      .eq("market_scope", "team")
      .eq("status", "pending")
      .order("pick_date", { ascending: false });

    if (pendingError) {
      return NextResponse.json({ ok: false, error: pendingError.message }, { status: 500 });
    }

    const pendingPicks = (pendingRows ?? []) as PendingPick[];

    if (pendingPicks.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "No pending team picks." });
    }

    const apiKey = process.env.ODDS_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing ODDS_API_KEY." }, { status: 500 });
    }

    const [nbaCompletedGames, mlbCompletedGames] = await Promise.all([
      fetchCompletedGames("basketball_nba", apiKey),
      fetchCompletedGames("baseball_mlb", apiKey),
    ]);

    let updated = 0;

    for (const pick of pendingPicks) {
      const completedGames = pick.sport === "MLB" ? mlbCompletedGames : nbaCompletedGames;
      const matchingGame = findMatchingGame(pick, completedGames);

      if (!matchingGame) continue;

      const scores = getGameScores(matchingGame);
      if (!scores) continue;

      const { homeScore, awayScore } = scores;
      let resultStatus: "win" | "loss" | "push" | null = null;

      if (pick.sport === "NBA" && pick.market_type === "spread") {
        resultStatus = gradeSpreadPick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
          lineTaken: Number(pick.line_taken ?? 0),
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "moneyline") {
        resultStatus = gradeMoneylinePick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "spread") {
        resultStatus = gradeSpreadPick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
          lineTaken: Number(pick.line_taken ?? 0),
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "total") {
        resultStatus = gradeTotalPick({
          side: pick.side ?? "",
          lineTaken: Number(pick.line_taken ?? 0),
          homeScore,
          awayScore,
        });
      }

      if (!resultStatus) continue;

      const unitsResult = settleUnits(
        Number(pick.odds_taken ?? -110),
        Number(pick.stake_units ?? 1),
        resultStatus
      );

      const finalScore = `${pick.away_team} ${awayScore} - ${pick.home_team} ${homeScore}`;

      const { error: updateError } = await supabase
        .from("picks")
        .update({
          status: resultStatus,
          final_score: finalScore,
          final_stat: null,
          units_result: unitsResult,
          graded_at: new Date().toISOString(),
        })
        .eq("id", pick.id);

      if (!updateError) {
        updated += 1;
      }
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("grade-picks");
    }

    return NextResponse.json({
      ok: true,
      updated,
      checked: pendingPicks.length,
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
