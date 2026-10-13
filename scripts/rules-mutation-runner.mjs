// Shared runner for the Rules mutation checks (local Emulator only; see mutate-*-rules.mjs).
// For each mutation it writes a weakened copy of firestore.rules to the OS temp folder (the real file is
// never edited), runs only the matching Rules tests against it via YOXI_RULES_FILE, and expects a failure.
// "equivalent" marks mutations that cannot change any reachable outcome (reason given); they must survive.
// Patterns apply only inside one block: from `marker` to the next "// ===== FSD-" marker (or the end).
//
// Judging (TAP output, tests run in-process with --test-isolation=none so stopping a run leaves no orphan
// test process talking to the Emulator; the next run's beforeEach clears the Emulator data anyway):
// - caught: a test reported "not ok" (the run is stopped there: fail-fast); its name is logged;
// - survived: every test passed and exactly `expectedTests` ran;
// - ERROR: the run failed without any failing test (Rules syntax error, load or hook failure), ran a
//   different number of tests, or timed out. An ERROR is never counted as caught.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TIMEOUT_MS = 5 * 60_000;
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the pattern's tests against a Rules file: { verdict: 'caught' | 'passed' | 'error', passed, failedTest, detail }. */
function runTests(rulesFile, testPattern) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', `--test-name-pattern=${testPattern}`, 'tests/firestore-rules.test.mjs'],
      { env: { ...process.env, YOXI_RULES_FILE: rulesFile }, stdio: ['ignore', 'pipe', 'ignore'] });
    let passed = 0;
    let failedTest = null;
    let hookFailed = false;
    let pending = null;            // a "not ok" whose YAML block (failureType) has not been read yet
    let timedOut = false;
    let buffer = '';
    // A failing test is only a catch when its own assertion failed. When the Rules cannot load, the
    // top-level before() hook fails and Node reports every test as "not ok" with failureType 'hookFailed':
    // that is a setup error, not a catch (QA short review).
    const finishFailure = (type) => {
      if (type === 'hookFailed') hookFailed = true;
      failedTest = pending;
      pending = null;
      child.kill();
    };
    const scan = (line) => {
      const ok = /^ok \d+ - (.*)$/.exec(line);       // top-level tests only (subtests are indented)
      const bad = /^\s*not ok \d+ - (.*)$/.exec(line);
      if (ok) passed += 1;
      if (failedTest !== null) return;
      if (pending !== null) {
        const type = /^\s*failureType: '([^']+)'/.exec(line);
        if (type) finishFailure(type[1]);
        else if (/^\s*\.\.\.\s*$/.test(line) || ok || bad) finishFailure(null); // end of the YAML block
        return;
      }
      if (bad) pending = bad[1];
    };
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(scan);
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buffer) scan(buffer);
      if (pending !== null) { failedTest = pending; pending = null; }
      if (hookFailed) resolve({ verdict: 'error', passed, failedTest, detail: 'a hook failed (Rules did not load or the Emulator setup failed)' });
      else if (failedTest !== null) resolve({ verdict: 'caught', passed, failedTest });
      else if (timedOut) resolve({ verdict: 'error', passed, detail: 'timed out' });
      else if (code !== 0) resolve({ verdict: 'error', passed, detail: `exit ${code} without a failing test (Rules or load error)` });
      else resolve({ verdict: 'passed', passed });
    });
  });
}

export async function runMutations({ marker, testPattern, expectedTests, mutations }) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the Firestore Emulator (npm run test:rules:mutation).');
  const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${marker} block not found`);
  const next = source.indexOf('// ===== FSD-', start + marker.length);
  const end = next < 0 ? source.length : next;
  const block = source.slice(start, end);

  // Every pattern must match exactly once in the block before any Emulator run.
  for (const [label, find] of mutations) if (block.split(find).length !== 2) throw new Error(`${label}: pattern not found exactly once`);

  const dir = mkdtempSync(join(tmpdir(), 'yoxi-mutation-'));
  const rows = [];
  try {
    // Baseline: the unmutated copy must pass with exactly the expected number of tests; otherwise a
    // renamed pattern (zero tests) would make every mutation "survive" and a broken setup "caught".
    const baseline = join(dir, 'baseline.rules');
    writeFileSync(baseline, source);
    const base = await runTests(baseline, testPattern);
    if (base.verdict !== 'passed' || base.passed !== expectedTests) {
      throw new Error(`Baseline invalid: ${base.verdict}, ${base.passed}/${expectedTests} tests passed${base.failedTest ? `, failed: ${base.failedTest}` : ''}${base.detail ? `, ${base.detail}` : ''}.`);
    }
    console.log(`baseline: ${base.passed} tests pass`);
    // Canary: a Rules file that cannot load must be judged ERROR, never "caught" (checks the judging itself).
    const canary = join(dir, 'canary.rules');
    writeFileSync(canary, `${source}\n this is not valid Rules syntax {`);
    const broken = await runTests(canary, testPattern);
    if (broken.verdict !== 'error') throw new Error(`Canary misjudged: an unloadable Rules file was judged "${broken.verdict}".`);
    console.log('canary: an unloadable Rules file is judged ERROR');
    for (const [label, find, replace, equivalent] of mutations) {
      const file = join(dir, 'firestore.rules');
      writeFileSync(file, source.slice(0, start) + block.replace(find, () => replace) + source.slice(end));
      // A run stopped at its first failure can leave the Emulator busy for a moment; let it settle (Security L1).
      await settle();
      let run = await runTests(file, testPattern);
      if (run.verdict === 'error' && /hook failed/.test(run.detail ?? '')) {
        // A setup failure right after a stopped run is retried once; a Rules that cannot load fails again.
        await settle(3000);
        run = await runTests(file, testPattern);
      }
      const killed = run.verdict === 'caught';
      const survived = run.verdict === 'passed' && run.passed === expectedTests;
      const ok = run.verdict === 'error' ? false : equivalent ? survived : killed;
      const result = killed ? `killed by "${run.failedTest}"` : survived ? (equivalent ? 'survived (equivalent)' : 'SURVIVED')
        : `ERROR (${run.detail ?? `${run.passed}/${expectedTests} tests`})`;
      rows.push({ label, result, ok, equivalent, killed });
      console.log(`${ok ? 'ok ' : 'BAD'} ${label}: ${result}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length} mutations: ${rows.filter((r) => r.killed).length} killed, ${rows.filter((r) => r.equivalent && r.ok).length} equivalent, ${bad.length} unexpected.`);
  for (const r of rows.filter((x) => x.equivalent)) console.log(`  equivalent ${r.label}: ${mutations.find((m) => m[0] === r.label)[3]}`);
  if (bad.length > 0) process.exit(1);
}
