function createRuntime(native = false) {
	return {
		native,
		appEvents: new Map<string, (event: { url: string }) => void>(),
		browserEvents: new Map<string, () => void>(),
		storage: new Map<string, string>(),
		launch: undefined as { url: string } | undefined,
		opened: [] as string[],
		paths: [] as string[],
		invalidations: [] as string[],
		onInvalidate: async () => {},
		onGoto: async () => {},
	};
}

export const runtime = createRuntime();

export function resetRuntime(native = false) {
	Object.assign(runtime, createRuntime(native));
}

export const Capacitor = { isNativePlatform: () => runtime.native };
export const page = { state: {} };

export const App = {
	async addListener(event: string, listener: (event: { url: string }) => void) {
		runtime.appEvents.set(event, listener);
		return {
			async remove() {
				runtime.appEvents.delete(event);
			},
		};
	},
	async getLaunchUrl() {
		return runtime.launch;
	},
};

export const Browser = {
	async open({ url }: { url: string }) {
		runtime.opened.push(url);
	},
	async close() {},
	async addListener(event: string, listener: () => void) {
		runtime.browserEvents.set(event, listener);
		return {
			async remove() {
				runtime.browserEvents.delete(event);
			},
		};
	},
};

export async function invalidate(key: string) {
	runtime.invalidations.push(key);
	await runtime.onInvalidate();
}

export async function goto(path: string | URL) {
	runtime.paths.push(String(path));
	await runtime.onGoto();
}
