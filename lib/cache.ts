import { getSupabaseServer } from "@/lib/supabaseServer";

const STALE_ODDS_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isOddsDataStale(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > STALE_ODDS_THRESHOLD_MS;
}

export async function getCachedData(cacheKey: string) {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("cached_market_data")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function setCachedData(cacheKey: string, payload: any) {
  const supabase = getSupabaseServer();

  const { error } = await supabase
    .from("cached_market_data")
    .upsert(
      {
        cache_key: cacheKey,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "cache_key",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}