#!/usr/bin/env node
/**
 * Offline queue behaviour suite.
 *
 * The offline layer is the one part of the app that has to be right without a
 * server to correct it, so it is tested against the real compiled source
 * rather than a re-implementation. `utils/offlineSync.ts` is transpiled into a
 * scratch directory where two modules are swapped for scriptable stand-ins:
 *
 *   • @react-native-async-storage/async-storage → an in-memory Map
 *   • ./api                                     → a fetch whose reply the test sets
 *
 * Run with: npm run test:offline
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..');
const work = mkdtempSync(join(tmpdir(), 'aflonmark-offline-'));

try {
  // Transpile the real module. tsc also emits ./api, which we then overwrite.
  execFileSync(
    'npx',
    [
      'tsc', '--ignoreConfig', 'utils/offlineSync.ts',
      '--outDir', work,
      '--module', 'commonjs',
      '--target', 'es2020',
      '--skipLibCheck',
      '--esModuleInterop',
      '--moduleResolution', 'node',
    ],
    { cwd: appRoot, stdio: 'pipe' }
  );
} catch {
  // tsc exits non-zero on the moduleResolution deprecation notice alone; the
  // emit still happens, and a genuine failure surfaces as a missing module below.
}

cpSync(join(here, 'stubs'), work, { recursive: true });
cpSync(join(here, 'offlineSync.test.js'), join(work, 'offlineSync.test.js'));

try {
  execFileSync(process.execPath, [join(work, 'offlineSync.test.js')], {
    cwd: work,
    env: { ...process.env, NODE_PATH: work },
    stdio: 'inherit',
  });
} catch {
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

rmSync(work, { recursive: true, force: true });
