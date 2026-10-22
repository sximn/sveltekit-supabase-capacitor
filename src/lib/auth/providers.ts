import type { Provider, SignInWithOAuthCredentials } from "@supabase/supabase-js";

export type OAuthProvider = Provider;
export type OAuthProviderOptions = Pick<
	NonNullable<SignInWithOAuthCredentials["options"]>,
	"scopes" | "queryParams"
>;
export type OAuthPending = Provider | null;

export type OAuthProviderConfig = OAuthProviderOptions & {
	id: Provider;
	label: string;
	enabled: boolean;
};

// Enable providers only after configuring them in Supabase and their developer console.
// Options here are public OAuth parameters. Client secrets belong in Supabase.
export const oauthProviders: readonly OAuthProviderConfig[] = [
	{ id: "google", label: "Google", enabled: true },
	{ id: "apple", label: "Apple", enabled: false },
	{ id: "facebook", label: "Facebook", enabled: false },
	{ id: "github", label: "GitHub", enabled: false },
];

export function getOAuthProvider(
	id: Provider,
	providers: readonly OAuthProviderConfig[] = oauthProviders,
): OAuthProviderConfig {
	const provider = providers.find((provider) => provider.id === id && provider.enabled);
	if (!provider) {
		throw new Error("This sign-in provider is not enabled.");
	}

	return provider;
}

export function getOAuthOptions(provider: OAuthProviderOptions): OAuthProviderOptions {
	return {
		...(provider.scopes ? { scopes: provider.scopes } : {}),
		...(provider.queryParams ? { queryParams: provider.queryParams } : {}),
	};
}
