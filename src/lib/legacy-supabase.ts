import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isCloudflareBackend } from "./backend-config";
import { cloudflareCommunity } from "./cloudflare-community";

// Migration boundary: Cloudflare builds never initialize an old auth client or
// silently send new player data to the unavailable Supabase project.
export const supabase: SupabaseClient = isCloudflareBackend
  ? cloudflareCommunity as unknown as SupabaseClient
  : createClient("https://afcqhievsmnepxopetkt.supabase.co", "sb_publishable_KXWRKJ6fLo1fRCwgYrzZ1w_C74D5Hno");
