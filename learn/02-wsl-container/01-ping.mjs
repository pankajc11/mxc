// WSL Container Example 1 — ping from a Linux container, report latency
//
// containment 'wslc' runs the command in a Linux container (image alpine:latest)
// inside the WSL 2 VM, not on Windows. So the command is Linux: `ping -c 3`.
//
// WSLC networking is all-or-nothing: egress, ingress and hostLoopback must all
// be 'allow' (bridged network) or all 'deny' (no network). Ping needs 'allow'.
// With network allowed, the first run also downloads the image if it isn't cached.
//
// Run:  node learn/02-wsl-container/01-ping.mjs [host]     (default host 1.1.1.1)
import { spawnSandboxFromConfig } from '@microsoft/mxc-sdk';
import { createConfigFromPolicy } from '@microsoft/mxc-sdk/v1';

const host = process.argv[2] ?? '1.1.1.1';

const config = createConfigFromPolicy({
  network: {
    egress: { default: 'allow' },
    ingress: { default: 'allow', hostLoopback: 'allow' },
  },
  timeoutMs: 120_000, // generous: the first run may pull the image
}, 'wslc');

config.wslc.image = 'alpine:latest';
config.process.commandLine = `ping -c 3 ${host}`;

console.log('containment:', config.containment, '| image:', config.wslc.image);
console.log('command:    ', config.process.commandLine, '\n');

const started = Date.now();
// skipPlatformCheck: the Node SDK's Windows probe never lists 'wslc', so its
// availability gate would refuse; the native engine does its own WSLC check.
const child = spawnSandboxFromConfig(config, { usePty: false, skipPlatformCheck: true });
let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
child.stderr.on('data', (d) => process.stderr.write(d));

child.on('close', (code) => {
  // Linux ping prints one line per reply: "... time=12.3 ms"
  const times = [...out.matchAll(/time[=<]([\d.]+) ?ms/g)].map((m) => Number(m[1]));
  console.log('\n=== Latency to', host, '===');
  times.forEach((t, i) => console.log(`  ping ${i + 1}: ${t} ms`));
  if (times.length) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  min ${Math.min(...times)} ms | avg ${avg.toFixed(2)} ms | max ${Math.max(...times)} ms`);
  } else {
    console.log('  no replies');
  }
  console.log(`exit code: ${code} | total time incl. container start: ${((Date.now() - started) / 1000).toFixed(1)}s`);
});
