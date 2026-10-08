// Example 2 — Read-only input, read-write output
//
// A common pattern: let untrusted code READ some inputs and WRITE results to
// one place, and nothing else.
//   readonlyPaths  -> can read, cannot modify or delete
//   readwritePaths -> can read and write
//   anything else  -> Access is denied
//
// Run:  node learn/01-process-container/02-input-output.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSandboxAsync } from '@microsoft/mxc-sdk/v1';

const base = resolve(import.meta.dirname, 'io');
const inputDir = join(base, 'input');      // read-only for the sandbox
const outputDir = join(base, 'output');    // read-write for the sandbox
const secretDir = join(base, 'secret');    // not granted at all
rmSync(base, { recursive: true, force: true });
for (const d of [inputDir, outputDir, secretDir]) mkdirSync(d, { recursive: true });

writeFileSync(join(inputDir, 'data.txt'), 'apples\r\nbananas\r\ncherries\r\n');
writeFileSync(join(secretDir, 'password.txt'), 'hunter2\r\n');

const policy = {
  filesystem: {
    readonlyPaths: [inputDir],
    readwritePaths: [outputDir],
  },
  network: {
    egress: { default: 'deny' },
    ingress: { default: 'deny', hostLoopback: 'deny' },
  },
  timeoutMs: 30_000,
};

async function run(title, command) {
  // outputDir doubles as the working directory: the sandbox is allowed to use it.
  const r = await spawnSandboxAsync(command, policy, {}, outputDir);
  const ok = r.exitCode === 0 ? 'ALLOWED' : 'BLOCKED';
  console.log(`\n[${ok}] ${title}\n  > ${command}`);
  const out = (r.stdout + r.stderr).trim();
  if (out) console.log('  ' + out.replace(/\r?\n/g, '\n  '));
}

const inFile = join(inputDir, 'data.txt');
const outFile = join(outputDir, 'report.txt');
const secret = join(secretDir, 'password.txt');

await run('Read the input file', `cmd /c type "${inFile}"`);
await run('Process input -> write report to output', `cmd /c sort /r "${inFile}" /o "${outFile}"`);
await run('Modify the read-only input', `cmd /c echo tampered >> "${inFile}"`);
await run('Delete the read-only input', `cmd /c del /q "${inFile}" && if exist "${inFile}" exit 1`);
await run('Read a folder that was never granted', `cmd /c type "${secret}"`);

// Verify from the host, outside the sandbox.
console.log('\n=== Checked from the host ===');
console.log('input unchanged: ', readFileSync(inFile, 'utf8') === 'apples\r\nbananas\r\ncherries\r\n');
console.log('report written:  ', existsSync(outFile) ? readFileSync(outFile, 'utf8').trim().split(/\r?\n/).join(', ') : false);
