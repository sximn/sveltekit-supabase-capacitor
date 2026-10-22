import type { CapacitorConfig } from '@capacitor/cli';

export type AppConfig = Required<Pick<CapacitorConfig, 'appId' | 'appName'>>;

// Managed by npm run setup; use that command to keep native identities in sync.
export default {
	appId: "com.supacapacitor.app",
	appName: "SupaCapacitor Starter",
} satisfies AppConfig;
