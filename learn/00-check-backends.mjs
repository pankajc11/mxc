// Which MXC backends can actually run on this machine?
import { getPlatformSupport } from '@microsoft/mxc-sdk';

const s = getPlatformSupport();
console.log('MXC supported:     ', s.isSupported);
console.log('Available backends:', s.availableMethods);
console.log('Process tier:      ', s.isolationTier);
for (const w of s.isolationWarnings ?? []) console.log('  warning:', w);
for (const [k, v] of Object.entries(s.unavailableReasons ?? {})) console.log(`  ${k} unavailable: ${v}`);
