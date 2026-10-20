export const NATIVE_AUTH_CALLBACK = "com.supacapacitor.app://auth/callback";
const RETURN_PATH_KEY = "supacapacitor:oauth:return-path";

type Listener = { remove(): Promise<void> };
type AuthError = { message: string } | null;

type Dependencies = {
	auth: {
		signInWithOAuth(options: {
			provider: "google";
			options: {
				redirectTo: string;
				skipBrowserRedirect: true;
			};
		}): Promise<{
			data: { url: string | null };
			error: AuthError;
		}>;

		exchangeCodeForSession(code: string): Promise<{
			data: { session: unknown | null };
			error: AuthError;
		}>;
	};

	app: {
		addListener(
			event: "appUrlOpen",
			listener: (event: { url: string }) => void,
		): Promise<Listener>;

		getLaunchUrl(): Promise<{ url: string } | undefined>;
	};

	browser: {
		open(options: { url: string }): Promise<void>;
		close(): Promise<void>;

		addListener(
			event: "browserFinished",
			listener: () => void,
		): Promise<Listener>;
	};

	storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;

	onSignedIn(path: string): Promise<void>;
	onError(message: string): void;
};

export function localReturnPath(path: string): string {
	return path.startsWith("/") &&
		!path.startsWith("//") &&
		!/[\\\u0000-\u0020]/.test(path)
		? path
		: "/app";
}

export function createNativeOAuth(deps: Dependencies) {
	let ready: Promise<void> | undefined;
	let listeners: Listener[] = [];
	let inFlight = false;
	let handlingCallback = false;

	const handledCallbacks = new Set<string>();

	function reportError(error: unknown) {
		deps.onError(
			error instanceof Error
				? error.message
				: "Unable to finish Google sign-in.",
		);
	}

	async function closeBrowser() {
		// cold-start callback may arrive without a browser controller to close
		await deps.browser.close().catch(() => {});
	}

	async function handleUrl(raw: string) {
		let url: URL;

		try {
			url = new URL(raw);
		} catch {
			return;
		}

		const callback = new URL(NATIVE_AUTH_CALLBACK);

		if (
			url.protocol !== callback.protocol ||
			url.host !== callback.host ||
			url.pathname !== callback.pathname ||
			url.username ||
			url.password ||
			url.hash ||
			handledCallbacks.has(raw) ||
			handlingCallback
		) {
			return;
		}

		const returnPath = deps.storage.getItem(RETURN_PATH_KEY);
		if (!returnPath) {
			return;
		}

		handledCallbacks.add(raw);
		handlingCallback = true;

		try {
			deps.storage.removeItem(RETURN_PATH_KEY);

			const error =
				url.searchParams.get("error_description") ||
				url.searchParams.get("error");
			if (error) {
				throw new Error(error);
			}

			const code = url.searchParams.get("code");
			if (!code) {
				throw new Error(
					"The sign-in callback did not contain an authorization code. Please try again.",
				);
			}

			const result = await deps.auth.exchangeCodeForSession(code);
			if (result.error) {
				throw new Error(result.error.message);
			}

			if (!result.data.session) {
				throw new Error("Sign-in did not create a session. Please try again.");
			}

			await closeBrowser();
			await deps.onSignedIn(localReturnPath(returnPath));
		} catch (error) {
			await closeBrowser();
			reportError(error);
		} finally {
			handlingCallback = false;
			inFlight = false;
		}
	}

	function handleBrowserFinished() {
		if (handlingCallback) {
			return;
		}

		let cancelled = false;

		try {
			if (!deps.storage.getItem(RETURN_PATH_KEY)) {
				return;
			}

			cancelled = true;
			deps.storage.removeItem(RETURN_PATH_KEY);
		} catch (error) {
			reportError(error);
			return;
		} finally {
			// reset even if reading or removing the stored path throws
			inFlight = false;
		}

		if (cancelled) {
			deps.onError("Google sign-in was cancelled. You can try again.");
		}
	}

	async function initialize() {
		if (!ready) {
			ready = (async () => {
				listeners.push(
					await deps.app.addListener("appUrlOpen", ({ url }) => {
						void handleUrl(url).catch(reportError);
					}),
				);

				listeners.push(
					await deps.browser.addListener(
						"browserFinished",
						handleBrowserFinished,
					),
				);

				const launch = await deps.app.getLaunchUrl();
				if (launch) {
					await handleUrl(launch.url);
				}
			})().catch(async (error) => {
				await Promise.all(listeners.map((listener) => listener.remove()));

				listeners = [];
				ready = undefined;
				throw error;
			});
		}

		await ready;
	}

	async function signIn(returnPath: string) {
		await initialize();

		if (inFlight || handlingCallback) {
			throw new Error("Google sign-in is already in progress.");
		}

		inFlight = true;

		try {
			deps.storage.setItem(RETURN_PATH_KEY, localReturnPath(returnPath));

			const { data, error } = await deps.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: NATIVE_AUTH_CALLBACK,
					skipBrowserRedirect: true,
				},
			});

			if (error) {
				throw new Error(error.message);
			}

			if (!data.url) {
				throw new Error("Google sign-in did not return an authorization URL.");
			}

			await deps.browser.open({ url: data.url });
		} catch (error) {
			try {
				deps.storage.removeItem(RETURN_PATH_KEY);
			} catch {
				// Preserve the original sign-in error if cleanup also fails.
			} finally {
				inFlight = false;
			}

			throw error;
		}
	}

	async function dispose() {
		await ready?.catch(() => {});

		await Promise.all(listeners.map((listener) => listener.remove()));

		listeners = [];
		ready = undefined;
	}

	return { initialize, signIn, dispose };
}
