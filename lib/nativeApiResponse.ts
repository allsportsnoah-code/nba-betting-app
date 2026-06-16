import { NextRequest, NextResponse } from "next/server";
import { getRequestUrl } from "@/lib/requestOrigin";

type NativePayload = {
  ok: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

type NativeResponseOptions = {
  fallbackPath: string;
  statusParam?: string;
};

function getNativeReturnUrl(req: NextRequest, fallbackPath: string) {
  const referer = req.headers.get("referer");
  if (referer) return referer;
  return getRequestUrl(req, fallbackPath);
}

export function apiJsonOrNativeRedirect(
  req: NextRequest,
  payload: NativePayload,
  init?: ResponseInit,
  options: NativeResponseOptions = { fallbackPath: "/" }
) {
  if (req.nextUrl.searchParams.get("native") !== "1") {
    return NextResponse.json(payload, init);
  }

  const target = new URL(getNativeReturnUrl(req, options.fallbackPath));
  target.searchParams.set(options.statusParam ?? "syncStatus", payload.ok ? "done" : "error");

  if (payload.error) {
    target.searchParams.set("syncError", payload.error.slice(0, 140));
  } else if (payload.message) {
    target.searchParams.set("syncMessage", payload.message.slice(0, 140));
  }

  return NextResponse.redirect(target, { status: 303 });
}
