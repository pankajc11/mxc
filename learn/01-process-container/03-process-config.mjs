// Example 3 — Configuring the process itself
//
// Besides WHAT the sandbox may access, you control HOW the process runs:
//   config.process.commandLine   the command to run
//   workingDirectory             where it starts (must be a granted folder)
//   env                          environment variables passed in
//   config.process.timeout       max run time (from policy.timeoutMs)
//   config.processContainer.*    process-container-only knobs (e.g. leastPrivilege)
//
// This uses spawnSandboxFromConfig, which streams output live as a normal
// Node ChildProcess, instead of spawnSandboxAsync, which waits for the end.
//
// Run:  node learn/01-process-container/03-process-config.mjs
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSandboxFromConfig } from '@microsoft/mxc-sdk';
import { createConfigFromPolicy } from '@microsoft/mxc-sdk/v1';

const workDir = resolve(import.meta.dirname, 'work');
mkdirSync(workDir, { recursive: true });

const config = createConfigFromPolicy({
  filesystem: { readwritePaths: [workDir] },
  network: {
    egress: { default: 'deny' },
    ingress: { default: 'deny', hostLoopback: 'deny' },
  },
  timeoutMs: 30_000,
});

// A small "job": print its settings, emit progress lines over ~3 seconds,
// write a result file, then exit with a custom code.
config.process.commandLine = [
  'cmd /c',
  'echo JOB_NAME=%JOB_NAME% MODE=%MODE% & echo cwd=%CD%',
  // A busy loop is the delay. The outer parentheses end the loop body; without
  // them cmd treats everything after "do" (including "exit") as part of the loop.
  '& (for /l %i in (1,1,3) do @(echo progress %i/3 & for /l %j in (1,1,150000) do @set x=%j))',
  '& echo result for %JOB_NAME% > result.txt',
  '& exit /b 7',
].join(' ');

// Process-container-specific settings live under config.processContainer.
// leastPrivilege also drops the broad "ALL APPLICATION PACKAGES" access, so even
// generally-readable system locations need an explicit grant. Leave it false
// here so cmd.exe can still start; try flipping it to see the difference.
config.processContainer = { ...config.processContainer, leastPrivilege: false };

console.log('commandLine:', config.process.commandLine);
console.log('timeout:    ', config.process.timeout, 'ms');
console.log('containment:', config.containment, '\n');

const env = { ...process.env, JOB_NAME: 'nightly-report', MODE: 'demo' };
const started = Date.now();
const child = spawnSandboxFromConfig(config, { usePty: false }, workDir, env);

// Output arrives while the process is still running.
child.stdout.on('data', (d) => process.stdout.write(`[+${((Date.now() - started) / 1000).toFixed(1)}s] ${d}`));
child.stderr.on('data', (d) => process.stderr.write(`[stderr] ${d}`));
child.on('close', (code) => {
  console.log(`\nexit code: ${code}  (the sandbox passes the process's own exit code back)`);
});
