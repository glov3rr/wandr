import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const projectUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim());

if (SUPABASE_URL && !projectUrl) {
  console.error(`js/lib/config.js: SUPABASE_URL should look like https://your-project.supabase.co but it is ${SUPABASE_URL}. Wandr is running without Supabase until this is fixed.`);
}

export const hasBackend = Boolean(projectUrl && SUPABASE_ANON_KEY.trim());

let client;

export function getClient() {
  client ??= import("../vendor/supabase.js").then(({ createClient }) =>
    createClient(SUPABASE_URL.trim().replace(/\/$/, ""), SUPABASE_ANON_KEY.trim()));
  return client;
}
