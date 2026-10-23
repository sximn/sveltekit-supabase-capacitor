import { supabase } from "#lib/supabase/client.ts";
import type { LayoutLoad } from "./$types";

// render every route in the browser/WebView, using the same SPA entry point
export const ssr = false;

export const load: LayoutLoad = async ({ depends }) => {
	depends("supabase:auth");

	const { data, error } = await supabase.auth.getClaims();

	return {
		supabase,
		authClaims: data?.claims,
		userId: data?.claims.sub,
		sessionError: error?.message ?? null,
	};
};
