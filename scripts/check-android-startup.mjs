// Exercise an actual signed APK. Static exports and debug clients cannot detect
// startup failures introduced by native release optimization.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { variants } from '../config/app-variants.cjs';

const { values } = parseArgs({
  options: {
    apk: { type: 'string' },
    serial: { type: 'string' },
    variant: { type: 'string', default: 'preview' },
  },
});
assert.ok(values.apk && existsSync(values.apk), 'Pass --apk with an existing APK');
assert.ok(Object.hasOwn(variants, values.variant), 'Unknown app variant');
const packageName = variants[values.variant].package;
const adb = process.env.ANDROID_HOME
  ? join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe')
    : 'adb';

function command(args, { optional = false } = {}) {
  const result = spawnSync(adb, args, {
    encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  if (!optional && (result.error || result.status !== 0)) {
    throw new Error('Android command failed: ' + args.filter(arg => !arg.endsWith('.apk')).join(' '));
  }
  return result.stdout ?? '';
}

const connected = command(['devices']).split(/\r?\n/)
  .map(line => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
assert.ok(values.serial || connected.length === 1, 'Choose one connected Android with --serial');
const serial = values.serial ?? connected[0];
assert.ok(connected.includes(serial), 'Selected Android is not connected');
const run = args => command(['-s', serial, ...args]);
const alive = () => command(['-s', serial, 'shell', 'pidof', packageName], { optional: true }).trim();
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const output = resolve('.expo', 'android-startup', values.variant);
mkdirSync(output, { recursive: true });

try {
  // Update in place: never uninstall, clear account storage or modify the backend.
  run(['install', '-r', resolve(values.apk)]);
  const starts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    run(['shell', 'am', 'force-stop', packageName]);
    run(['shell', 'am', 'start', '-W', '-n', packageName + '/.MainActivity']);
    await wait(1500);
    for (let second = 0; second < 10; second++) {
      assert.ok(alive(), 'Android terminated the application during startup');
      await wait(1000);
    }
    const remote = '/sdcard/razemgo-startup-check.xml';
    run(['shell', 'uiautomator', 'dump', remote]);
    const xml = run(['shell', 'cat', remote]);
    writeFileSync(join(output, 'start-' + attempt + '.xml'), xml);
    assert.ok(!xml.includes('Coś poszło nie tak'), 'Application rendered its error screen');
    assert.match(xml, /Nowe konto|Zaloguj się|Znajdź ekipę|Odkrywaj|Samouczek/,
      'Expected welcome or home controls; application may be stuck at startup');
    assert.ok(alive(), 'Android terminated the application after rendering');
    starts.push({ attempt, rendered: true, processAlive: true });
    console.log('Android cold start ' + attempt + '/3 passed.');
  }
  writeFileSync(join(output, 'result.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), variant: values.variant, package: packageName,
    apk: resolve(values.apk), passed: true, starts,
  }, null, 2));
} catch (error) {
  // Raw device output stays in the ignored local diagnostics directory.
  const log = command(['-s', serial, 'logcat', '-d', '-b', 'crash', '-t', '300'], { optional: true });
  writeFileSync(join(output, 'crash.log'), log);
  writeFileSync(join(output, 'result.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), variant: values.variant, package: packageName,
    passed: false, reason: error.message,
  }, null, 2));
  console.error(error.message + '. Diagnostics: ' + output);
  process.exitCode = 1;
}
