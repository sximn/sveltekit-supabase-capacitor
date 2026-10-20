import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "$app/env/public";

function createBrowserClient() {
	return createSupabaseClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	);
}

export const supabase = createBrowserClient();
