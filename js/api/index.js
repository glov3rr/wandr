import { hasBackend } from "../lib/supabase.js";
import * as remote from "./remote.js";
import * as local from "./local.js";

export const api = hasBackend ? remote : local;
export { hasBackend };
