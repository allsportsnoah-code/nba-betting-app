import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";

const SESSION_COOKIE = "betting_lab_owner";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function getSessionSecret() {
  return process.env.OWNER_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "local-dev-secret";
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function getOwnerUsername() {
  return process.env.OWNER_USERNAME ?? "owner";
}

function getOwnerPassword() {
  return process.env.OWNER_PASSWORD ?? "";
}

export function getManualSyncLimit() {
  return Number(process.env.OWNER_MANUAL_SYNC_LIMIT ?? 4);
}

function buildCookieValue(username: string, expiresAt: number) {
  const payload = `${username}.${expiresAt}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function parseCookieValue(value: string | undefined) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length < 3) return null;
  const signature = parts.pop() ?? "";
  const expiresAt = Number(parts.pop() ?? "");
  const username = parts.join(".");
  const payload = `${username}.${expiresAt}`;

  if (!signature || Number.isNaN(expiresAt)) return null;
  if (signPayload(payload) !== signature) return null;
  if (Date.now() > expiresAt) return null;
  if (username !== getOwnerUsername()) return null;

  return { username, expiresAt };
}

export function credentialsMatch(username: string, password: string) {
  return username === getOwnerUsername() && password === getOwnerPassword() && password.length > 0;
}

export function setOwnerSession(response: NextResponse, username: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;

  response.cookies.set({
    name: SESSION_COOKIE,
    value: buildCookieValue(username, expiresAt),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearOwnerSession(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getOwnerSession() {
  const cookieStore = await cookies();
  return parseCookieValue(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function isOwnerLoggedIn() {
  const session = await getOwnerSession();
  return Boolean(session);
}

export function isOwnerRequest(req: NextRequest) {
  return Boolean(parseCookieValue(req.cookies.get(SESSION_COOKIE)?.value));
}

export function isAutomationRequest(req: NextRequest) {
  const secret = process.env.AUTO_SYNC_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers.get("x-auto-sync-secret");
  const querySecret = req.nextUrl.searchParams.get("syncSecret");

  return headerSecret === secret || querySecret === secret;
}

export function getEtDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type SyncUsage = {
  date: string;
  count: number;
  actions: Array<{ action: string; at: string }>;
};

export async function getManualSyncUsage() {
  const date = getEtDateKey();
  const row = await getCachedData("owner_manual_sync_usage");
  const usage = (row?.data as SyncUsage | null) ?? null;

  if (!usage || usage.date !== date) {
    return { date, count: 0, actions: [] as Array<{ action: string; at: string }> };
  }

  return usage;
}

export async function recordManualSyncUsage(action: string) {
  const usage = await getManualSyncUsage();
  const nextUsage: SyncUsage = {
    date: usage.date,
    count: usage.count + 1,
    actions: [...usage.actions, { action, at: new Date().toISOString() }],
  };

  await setCachedData("owner_manual_sync_usage", nextUsage);
  return nextUsage;
}

export async function requireSyncAccess(
  req: NextRequest,
  options?: { countAgainstLimit?: boolean }
) {
  const countAgainstLimit = options?.countAgainstLimit ?? false;

  if (isAutomationRequest(req)) {
    return { ok: true as const, access: "automation" as const };
  }

  if (!isOwnerRequest(req)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Owner login required for sync actions." },
        { status: 401 }
      ),
    };
  }

  if (!countAgainstLimit) {
    return { ok: true as const, access: "owner" as const };
  }

  const usage = await getManualSyncUsage();
  const limit = getManualSyncLimit();

  if (usage.count >= limit) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: `Daily manual sync limit reached (${limit}).`,
          usage,
        },
        { status: 429 }
      ),
    };
  }

  return { ok: true as const, access: "owner" as const, usage };
}
