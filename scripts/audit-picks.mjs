import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(rootDir) {
  const envPath = path.join(rootDir, ".env.local");
  const envText = fs.readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

function getDisplayDate(row) {
  if (!row.game_start_time) return row.pick_date ?? null;

  const gameStart = new Date(row.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return row.pick_date ?? null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(gameStart);

  const getPart = (type) => Number(parts.find((part) => part.type === type)?.value);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(
    anchor.getUTCDate()
  ).padStart(2, "0")}`;
}

function getDedupeKey(row) {
  const date = row.sport === "MLB" ? getDisplayDate(row) ?? row.pick_date ?? "" : row.pick_date ?? "";

  return [
    date,
    row.sport ?? "",
    row.market_scope ?? "",
    row.market_type ?? "",
    row.game_label ?? "",
    row.player_name ?? "",
    row.side ?? "",
    row.line_taken ?? "",
  ].join("::");
}

function isSettled(row) {
  return Boolean(row.status && row.status !== "pending");
}

function getTimeValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function choosePreferredPick(existing, next) {
  const existingSettled = isSettled(existing);
  const nextSettled = isSettled(next);

  if (existingSettled !== nextSettled) {
    return nextSettled ? next : existing;
  }

  const existingTime = Math.max(getTimeValue(existing.graded_at), getTimeValue(existing.created_at));
  const nextTime = Math.max(getTimeValue(next.graded_at), getTimeValue(next.created_at));

  return nextTime >= existingTime ? next : existing;
}

async function fetchAllRawRows(supabase) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("picks")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

function buildDedupedRows(rawRows) {
  const deduped = new Map();
  const rawGroups = new Map();

  for (const row of rawRows) {
    const key = getDedupeKey(row);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      rawGroups.set(key, [row]);
      continue;
    }

    deduped.set(key, choosePreferredPick(existing, row));
    rawGroups.get(key)?.push(row);
  }

  return {
    dedupedRows: Array.from(deduped.values()),
    duplicateGroups: Array.from(rawGroups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({
        key,
        count: rows.length,
        statuses: Array.from(new Set(rows.map((row) => row.status ?? "null"))),
      })),
  };
}

function buildBoardIssues(rows) {
  const issues = [];
  const dates = Array.from(
    new Set(
      rows
        .filter((row) => row.sport === "MLB")
        .map((row) => getDisplayDate(row) ?? row.pick_date)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  for (const date of dates) {
    for (const scope of ["team", "player_prop"]) {
      const slice = rows.filter(
        (row) =>
          row.sport === "MLB" &&
          row.market_scope === scope &&
          (getDisplayDate(row) ?? row.pick_date) === date
      );

      const topRows = slice.filter((row) => row.is_top_pick);
      const valueRows = slice.filter((row) => row.notes === "best_value");
      const overlapRows = slice.filter((row) => row.is_top_pick && row.notes === "best_value");
      const ranks = topRows
        .map((row) => row.top_pick_rank)
        .filter((rank) => rank !== null && rank !== undefined)
        .sort((a, b) => a - b);
      const contiguousRanks = ranks.every((rank, index) => rank === index + 1);

      if (
        topRows.length > 3 ||
        valueRows.length > 3 ||
        overlapRows.length > 0 ||
        ranks.length !== topRows.length ||
        !contiguousRanks
      ) {
        issues.push({
          date,
          scope,
          topCount: topRows.length,
          valueCount: valueRows.length,
          overlapCount: overlapRows.length,
          ranks,
        });
      }
    }
  }

  return issues;
}

function buildDailyNet(rows) {
  const dailyNet = new Map();

  for (const row of rows) {
    if (!isSettled(row)) continue;
    const date = row.pick_date;
    dailyNet.set(date, Number(((dailyNet.get(date) ?? 0) + Number(row.units_result ?? 0)).toFixed(2)));
  }

  return Array.from(dailyNet.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, net]) => ({ date, net }));
}

function buildBoardSnapshot(rows, date) {
  const forDate = rows.filter((row) => (getDisplayDate(row) ?? row.pick_date) === date);

  return {
    teamTop: forDate.filter((row) => row.sport === "MLB" && row.market_scope === "team" && row.is_top_pick).length,
    teamValue: forDate.filter(
      (row) => row.sport === "MLB" && row.market_scope === "team" && row.notes === "best_value"
    ).length,
    propTop: forDate.filter(
      (row) => row.sport === "MLB" && row.market_scope === "player_prop" && row.is_top_pick
    ).length,
    propValue: forDate.filter(
      (row) => row.sport === "MLB" && row.market_scope === "player_prop" && row.notes === "best_value"
    ).length,
  };
}

async function main() {
  const rootDir = process.cwd();
  loadEnvFile(rootDir);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rawRows = await fetchAllRawRows(supabase);
  const { dedupedRows, duplicateGroups } = buildDedupedRows(rawRows);
  const boardIssues = buildBoardIssues(dedupedRows);
  const dailyNet = buildDailyNet(dedupedRows);
  const requestedDate = process.argv[2];
  const latestDate =
    Array.from(
      new Set(
        dedupedRows
          .filter((row) => row.sport === "MLB")
          .map((row) => getDisplayDate(row) ?? row.pick_date)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b)).at(-1) ?? null;
  const auditDate = requestedDate ?? latestDate;

  const summary = {
    rawRowCount: rawRows.length,
    dedupedRowCount: dedupedRows.length,
    duplicateGroupCount: duplicateGroups.length,
    boardIssueCount: boardIssues.length,
    auditDate,
    boardSnapshot: auditDate ? buildBoardSnapshot(dedupedRows, auditDate) : null,
    recentDailyNet: dailyNet.slice(-7),
  };

  console.log("Pick audit summary");
  console.log(JSON.stringify(summary, null, 2));

  if (duplicateGroups.length > 0) {
    console.log("\nDuplicate groups");
    console.log(JSON.stringify(duplicateGroups.slice(0, 20), null, 2));
  }

  if (boardIssues.length > 0) {
    console.log("\nBoard issues");
    console.log(JSON.stringify(boardIssues, null, 2));
  }

  if (duplicateGroups.length > 0 || boardIssues.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("\nNo duplicate dedupe-key collisions or MLB board tag inconsistencies found.");
}

await main();
