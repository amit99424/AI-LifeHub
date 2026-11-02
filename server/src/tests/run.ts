/**
 * Lightweight in-process test runner.
 *
 * Node's built-in `node:test` spawns a child process per test file, which some
 * sandboxed environments block (EPERM on spawn). This runner imports each test
 * module in the same process and executes the cases registered through the
 * `__lhTest` hook, printing a TAP-style summary and exiting non-zero on failure.
 *
 * Usage: npm test
 */
process.env.NODE_ENV = 'test';

const TEST_FILES = ['./features.test.js'];

type Case = { name: string; fn: () => void | Promise<void> };

const hook = globalThis as unknown as { __lhTest: (name: string, fn: Case['fn']) => void };
let collected: Case[] = [];
hook.__lhTest = (name, fn) => {
  collected.push({ name, fn });
};

const cases: Case[] = [];
for (const file of TEST_FILES) {
  collected = [];
  // eslint-disable-next-line no-await-in-loop
  await import(new URL(file, import.meta.url).href);
  cases.push(...collected);
}

let pass = 0;
let fail = 0;
for (const c of cases) {
  try {
    // eslint-disable-next-line no-await-in-loop
    await c.fn();
    pass += 1;
    console.log(`ok ${pass + fail} - ${c.name}`);
  } catch (err) {
    fail += 1;
    console.log(`not ok ${pass + fail} - ${c.name}`);
    console.log(`  ---\n  ${(err as Error).message?.split('\n').join('\n  ')}\n  ...`);
  }
}

console.log(`\n# tests ${pass + fail}\n# pass ${pass}\n# fail ${fail}`);
if (fail > 0) process.exitCode = 1;
