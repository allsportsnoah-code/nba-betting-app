import { NextRequest } from "next/server";
import { setCachedData } from "@/lib/cache";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { getResolvedNbaTeamOddsCache } from "@/lib/nbaOddsCache";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { NBA_PROP_TYPES, isNbaPropType, type NbaPropType } from "@/lib/propModel";
import { getRequestOrigin } from "@/lib/requestOrigin";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const propType = req.nextUrl.searchParams.get("propType") ?? "points";
    const origin = getRequestOrigin(req);
    const propTypes: NbaPropType[] = propType === "all" ? NBA_PROP_TYPES : isNbaPropType(propType) ? [propType] : [];
    const resolvedTeamOdds = await getResolvedNbaTeamOddsCache(day);
    const cachedTeamGames = resolvedTeamOdds.active?.data;

    if (propTypes.length === 0) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: "Invalid propType" },
        { status: 400 },
        { fallbackPath: "/dashboard" }
      );
    }

    if (Array.isArray(cachedTeamGames) && cachedTeamGames.length === 0) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: true,
          skipped: true,
          businessDate: resolvedTeamOdds.active?.businessDate ?? resolvedTeamOdds.expectedBusinessDate,
          message: `No NBA games found for ${resolvedTeamOdds.expectedBusinessDate}. Props sync skipped.`,
          gameCount: 0,
        },
        undefined,
        { fallbackPath: "/dashboard" }
      );
    }

    if (propType === "all") {
      const propsRes = await fetch(`${origin}/api/props?day=${day}&propType=all`, {
        cache: "no-store",
      });
      const props = await propsRes.json();

      if (!props.ok) {
        return apiJsonOrNativeRedirect(req, { ok: false, error: props.error }, { status: 500 }, { fallbackPath: "/dashboard" });
      }

      const results: Record<string, unknown> = {};
      const errors: Record<string, string> = {};

      for (const market of propTypes) {
        const marketProps = props.byType?.[market] ?? {
          ok: true,
          businessDate: props.businessDate,
          propType: market,
          data: [],
          auditMenu: [],
          diagnostics: {
            eventsChecked: props.diagnostics?.eventsChecked ?? 0,
            eventsWithProps: 0,
            failedEvents: props.diagnostics?.failedEvents ?? 0,
          },
        };

        await setCachedData(`props_${day}_${market}`, marketProps);

        const boardRes = await fetch(`${origin}/api/daily-props?day=${day}&propType=${market}&useCache=1`, {
          cache: "no-store",
        });
        const board = await boardRes.json();

        if (!boardRes.ok || !board.ok) {
          errors[market] = board.error || `Failed to sync ${market}`;
        } else {
          results[market] = {
            topPicks: board.topPicks?.length ?? 0,
            bestValues: board.bestValues?.length ?? 0,
            candidates: marketProps.data?.length ?? 0,
          };
        }
      }

      if (access.access === "owner") {
        await recordManualSyncUsage("sync-props-all");
      }

      const okCount = Object.keys(results).length;
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: okCount > 0,
          message: `Cached and synced ${okCount}/${propTypes.length} NBA prop markets for ${day}`,
          results,
          errors,
        },
        okCount > 0 ? undefined : { status: 500 },
        { fallbackPath: "/dashboard" }
      );
    }

    const propsRes = await fetch(`${origin}/api/props?day=${day}&propType=${propType}`, {
      cache: "no-store",
    });

    const props = await propsRes.json();

    if (!props.ok) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: props.error }, { status: 500 }, { fallbackPath: "/dashboard" });
    }

    await setCachedData(`props_${day}_${propType}`, props);

    const boardRes = await fetch(`${origin}/api/daily-props?day=${day}&propType=${propType}&useCache=1`, {
      cache: "no-store",
    });
    const board = await boardRes.json();

    if (!boardRes.ok || !board.ok) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: board.error || "Failed to sync NBA prop board." },
        { status: 500 },
        { fallbackPath: "/dashboard" }
      );
    }

    if (access.access === "owner") {
      await recordManualSyncUsage(`sync-props-${propType}`);
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      message: `Cached and synced props for ${day} - ${propType}`,
    }, undefined, { fallbackPath: "/dashboard" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/dashboard" }
    );
  }
}
