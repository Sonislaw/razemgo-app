import { spawn } from 'node:child_process';

// This isolated Metro process never receives live backend configuration.
const child = spawn(
  process.execPath,
  ['node_modules/expo/bin/cli', 'start', '--port', '8085'],
  {
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      BROWSER: 'none',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        'sb_publishable_razemgo_browser_test_only',
      EXPO_PUBLIC_ENABLE_DEMO: 'false',
      EXPO_PUBLIC_SENTRY_DSN: 'https://testonly@monitoring.razemgo.invalid/1',
      EXPO_PUBLIC_MONITORING_IN_DEV: 'true',
      EXPO_PUBLIC_APP_ENV: 'development',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
