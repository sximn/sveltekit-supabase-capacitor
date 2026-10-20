import { supabase } from "#lib/supabase/client.ts";
import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ depends, route }) => {
  depends("supabase:auth");

  const { data } = await supabase.auth.getClaims();

  /**
   * Only authenticated users can access these paths and their sub-paths.
   *
   * If you don't use a layout group for auth-protected paths, then you can use
   * new Set(['app', 'self']) or whatever your top-level path segments are, and
   * .has(event.url.pathname.split('/')[1])
   */
  // const auth_protected_paths = new Set(['(authenticated)'])
  // if (!data?.claims.session_id && auth_protected_paths.has(route.id?.split('/')[1] || '')) {
  //     console.log(">> NO auth in route: ", route.id);
  //     redirect(307, '/auth')
  // }

  return {
    supabase,
    authClaims: data?.claims,
    userId: data?.claims.sub,
  };
};
