import type { SupabaseClient } from "@supabase/supabase-js";

export async function initializeWebOAuth(
	auth: Pick<SupabaseClient["auth"], "initialize">,
	url: URL,
) {
	// The SDK already processed the redirect. Read its cached result, including
	// failures that don't emit a signed-in auth event.
	const { error } = await auth.initialize();
	if (!error) {
		return { error: null, url: null };
	}

	const cleanUrl = new URL(url);
	const fragment = new URLSearchParams(cleanUrl.hash.slice(1));

	let changedFragment = false;

	for (const key of ["error", "error_description", "error_code"]) {
		if (cleanUrl.searchParams.has(key)) {
			cleanUrl.searchParams.delete(key);
		}

		if (fragment.has(key)) {
			fragment.delete(key);
			changedFragment = true;
		}
	}

	if (changedFragment) {
		cleanUrl.hash = fragment.toString();
	}

	return { error: error.message, url: cleanUrl };
}
