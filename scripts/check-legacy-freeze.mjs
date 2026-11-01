// Legacy freeze check. These files define and test today's behaviour (ruleset legacy-0) and must
// stay identical to the baseline commit while the new engine is built beside them.
// Run with `npm run check:freeze` (also part of `npm run verify`).
import { execFileSync } from 'node:child_process';

const BASELINE = '6974845';
const FROZEN = [
  'src/engine/engine.ts',
  'src/engine/model.ts',
  'src/engine/personas.ts',
  'src/engine/useEngine.ts',
  'src/engine/__tests__/driver.ts',
  'src/engine/__tests__/engine.test.ts',
  'src/onboarding/ideaDraft.test.ts',
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

try {
  git('cat-file', '-e', `${BASELINE}^{commit}`);
} catch {
  console.error(`Legacy freeze: baseline commit ${BASELINE} not found.`);
  process.exit(1);
}

// Compares the working tree (committed, staged and unstaged changes) with the baseline.
const changed = git('diff', '--name-status', BASELINE, '--', ...FROZEN);
if (changed) {
  console.error(`Legacy freeze: these files differ from ${BASELINE}:\n${changed}`);
  process.exit(1);
}
console.log(`Legacy freeze: ${FROZEN.length} files match ${BASELINE}.`);
