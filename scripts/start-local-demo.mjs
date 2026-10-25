import { spawn } from 'node:child_process';

// Read neither .env.local nor the Preview settings. This mode makes no backend writes.
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--dev-client', '--scheme', 'razemgo-dev', '--port', '8090', ...process.argv.slice(2)], {
  windowsHide: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_NO_DOTENV: '1',
    APP_VARIANT: 'development',
    EXPO_PUBLIC_APP_ENV: 'development',
    EXPO_PUBLIC_ENABLE_DEMO: 'true',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_preview_only',
    EXPO_PUBLIC_SENTRY_DSN: '',
    EXPO_PUBLIC_MONITORING_IN_DEV: 'false',
    BROWSER: 'none',
  },
});
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
