import { getSupabaseServer } from "@/lib/supabaseServer";

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