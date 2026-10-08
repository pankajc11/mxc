// Example 1 — What IS a process container?
//
// You describe WHAT the sandbox may do (a policy). The SDK turns it into a
// ContainerConfig with containment "process". wxc-exec then launches your
// command as a normal Windows process, but under an AppContainer identity:
// it gets its own private profile folders and can only reach what the policy grants.
//
// Run:  node learn/01-process-container/01-identity.mjs
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createConfigFromPolicy, spawnSandboxAsync } from '@microsoft/mxc-sdk/v1';

// The sandbox needs a working directory it is allowed to use. If you don't give
// it one, it inherits yours (which it can't access) and child commands fail with
// "The current directory is invalid".
const workDir = resolve(import.meta.dirname, 'work');
mkdirSync(workDir, { recursive: true });

const policy = {
  filesystem: { readwritePaths: [workDir] },
  network: {
    egress: { default: 'deny' },
    ingress: { default: 'deny', hostLoopback: 'deny' },
  },
  timeoutMs: 30_000,
};

// 1. The ContainerConfig the SDK generates (this JSON is what wxc-exec receives).
console.log('=== Generated ContainerConfig ===');
console.log(JSON.stringify(createConfigFromPolicy(policy), null, 2));

// 2. Ask the sandboxed process what it sees.
async function sandboxed(title, command) {
  const r = await spawnSandboxAsync(command, policy, {}, workDir);
  console.log(`\n--- ${title} ---\n> ${command}`);
  console.log((r.stdout + r.stderr).trim());
  console.log(`exit code: ${r.exitCode}`);
}

console.log('\n=== Inside the sandbox ===');
await sandboxed('Working directory', 'cmd /c cd');
await sandboxed('Where TEMP points (a private per-container folder)', 'cmd /c echo %TEMP%');
await sandboxed('Write + read its own TEMP', 'cmd /c echo scratch data > "%TEMP%\\note.txt" && type "%TEMP%\\note.txt"');
await sandboxed('List your Documents folder', 'cmd /c dir /b "%USERPROFILE%\\Documents"');

// 3. Compare with the host (you).
console.log('\n=== On the host (you) ===');
console.log(`TEMP: ${process.env.TEMP}`);
const docs = join(homedir(), 'Documents');
try {
  console.log(`Documents has ${readdirSync(docs).length} entries`);
} catch (e) {
  console.log(`Documents: ${e.code}`);
}
