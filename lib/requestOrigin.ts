import { headers } from "next/headers";
import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || null;
}

function getOriginFromHeaderValue(
  getHeader: (name: string) => string | null | undefined,
  fallbackOrigin?: string
) {
  const host = firstHeaderValue(getHeader("x-forwarded-host")) ?? firstHeaderValue(getHeader("host"));

  if (!host) {
    return fallbackOrigin ?? "http://localhost:3000";
  }

  const proto =
    firstHeaderValue(getHeader("x-forwarded-proto")) ??
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

export function getRequestOrigin(req: NextRequest) {
  return getOriginFromHeaderValue((name) => req.headers.get(name), req.nextUrl.origin);
}

export function getRequestUrl(req: NextRequest, path: string) {
  return new URL(path, getRequestOrigin(req));
}

export async function getServerRequestOrigin() {
  const headerStore = await headers();
  return getOriginFromHeaderValue((name) => headerStore.get(name));
}
