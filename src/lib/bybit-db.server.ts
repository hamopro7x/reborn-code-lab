// Shared service-role Supabase client access for Bybit server modules.
export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
