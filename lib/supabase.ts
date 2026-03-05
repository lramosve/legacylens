import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Singleton server-side client — reused across requests to avoid
// re-creating the SDK + TCP connection on every call.
let _serverClient: SupabaseClient | null = null;

export function createServerClient() {
  if (_serverClient) return _serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  _serverClient = createClient(url, key);
  return _serverClient;
}

// Browser-side client with anon key (for read-only operations)
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
