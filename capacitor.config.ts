import type { CapacitorConfig } from '@capacitor/cli';
import app from './src/lib/app-config.ts';

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: 'build',
};

export default config;
