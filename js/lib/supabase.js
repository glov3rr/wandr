import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const LIBRARY = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";

export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client;

export function getClient() {
  client ??= import(LIBRARY).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  return client;
}
