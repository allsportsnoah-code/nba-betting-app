import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { isAutomationRequest, isOwnerRequest } from "@/lib/ownerAuth";

const execFileAsync = promisify(execFile);

function parseScriptJson(stdout: string) {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse()
    .find((entry) => entry.startsWith("{") && entry.endsWith("}"));

  if (!line) {
    throw new Error("Ranking script did not return JSON output.");
  }

  return JSON.parse(line);
}

export async function GET(req: NextRequest) {
  try {
    if (!isAutomationRequest(req) && !isOwnerRequest(req)) {
      return NextResponse.json({ ok: false, error: "Owner login or automation secret required." }, { status: 401 });
    }

    const scriptPath = path.join(process.cwd(), "scripts", "sync-nba-impact-rankings.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
      cwd: process.cwd(),
      timeout: 12 * 60 * 1000,
      maxBuffer: 1024 * 1024 * 8,
    });
    const data = parseScriptJson(stdout);

    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error ?? "NBA impact ranking sync failed.", stderr },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Synced NBA impact rankings for ${data.teams} teams / ${data.players} players.`,
      data,
      stderr: stderr || null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
