import { supabase } from "#lib/supabase/client.ts";
import type { LayoutLoad } from "./$types";

export const prerender = true;

export const load: LayoutLoad = async ({ depends }) => {
	depends("supabase:auth");

	const { data } = await supabase.auth.getClaims();

	return {
		supabase,
		authClaims: data?.claims,
		userId: data?.claims.sub,
	};
};
