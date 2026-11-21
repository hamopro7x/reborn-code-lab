import type { SupabaseClient } from "@supabase/supabase-js";

export type DB = SupabaseClient<any, any, any>;

export async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
