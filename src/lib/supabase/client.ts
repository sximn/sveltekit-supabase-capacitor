import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from "$app/env/public";

function createBrowserClient() {
	return createSupabaseClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			auth: {
				flowType: "pkce",
				detectSessionInUrl: !Capacitor.isNativePlatform(),
				persistSession: true,
				autoRefreshToken: true,
			},
		},
	);
}

export const supabase = createBrowserClient();
