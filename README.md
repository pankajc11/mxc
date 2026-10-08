# Learning MXC

Hands-on notes for learning Microsoft eXecution Containers (MXC), one topic at a time.
Every example lives under `learn/` and is run from the repo root with `node`.

## Topics

| # | Topic | Status |
|---|---|---|
| 0 | [Setup and Hello World](#0-setup-and-hello-world) | ✅ Done |
| 1 | [Process Container](#1-process-container) | ✅ Done |
| 2 | [Windows Sandbox](#2-windows-sandbox) | 🟡 In progress |
| 3 | [WSL Container (WSLC)](#3-wsl-container-wslc) | 🟡 In progress |
| 4 | Isolation Session | ⏳ |
| 5 | [MicroVM (NanVix)](#5-microvm-nanvix) | 🟡 In progress |
| 6 | [Hyperlight MicroVM](#6-hyperlight-microvm) | 🟡 In progress |
| 7 | Filesystem Policy | ⏳ |
| 8 | Network Policy | ⏳ |
| 9 | Process configuration | ⏳ |
| 10 | Lifecycle: Provision, Start, Execute, Stop, Deprovision | 🟡 Started: [Windows Sandbox state-aware](#state-aware-mode-one-vm-many-commands) |
| 11 | UI/GUI isolation | ⏳ |
| 12 | Resource and execution controls: timeout, process termination, CPU-intensive workloads | ⏳ |

---

## 0. Setup and Hello World

### Building MXC from source

The npm package (`@microsoft/mxc-sdk` 0.9.0) is older than this repo's `main`, so MXC is
built locally. This build includes every optional backend:

```
build.bat --with-microvm --with-wslc --with-isolation-session --with-hyperlight
```

This build:
- puts the native binaries (`wxc-exec.exe`, `mxc_ffi.dll`, `wxc-host-prep.exe`, NanVix runtime files, the WSLC client SDK, and others) in `sdk/node/bin/x64/`
- builds the TypeScript SDK into `sdk/node/dist`, including the `/v1` API
- packages the .NET SDK at `output/packages/Microsoft.Mxc.Sdk.0.9.0-local-win-x64.nupkg`

The root `package.json` points at the local SDK (`"@microsoft/mxc-sdk": "file:sdk/node"`),
so rebuilding updates the examples automatically. To pick up new changes: `git pull`, then `build.bat` with the same flags.

### Which backends can run on this machine

```
node learn/00-check-backends.mjs
```

| Backend | In the build | Runs on this machine? |
|---|---|---|
| Process Container | ✅ | ✅ Working |
| MicroVM (NanVix) | ✅ | ✅ Working (warm runs ~260 ms) |
| Hyperlight | ✅ | ✅ Working after `wxc-exec.exe --setup-hyperlight=python` |
| Windows Sandbox | ✅ | ✅ Working with `--experimental` (feature now enabled) |
| WSL Container (WSLC) | ✅ | ✅ Working after updating WSL to 3.0.1 |
| Isolation Session | ✅ | ❌ Needs Windows Insider build 26340.9212+ (installed: 26200) |

> On Windows, `getPlatformSupport()` never checks for `microvm` or `wslc`, so their
> absence from its list doesn't mean they're broken. `windows_sandbox` does appear in the list.

### Hello World

```
node hello.mjs
```

Expected output:

```
Backends: [ 'processcontainer' ] | tier: appcontainer-dacl
stdout: Hello World from MXC
stderr:
exit code: 0
```

### Problems hit during setup

| Problem | Cause | Fix |
|---|---|---|
| `Policy version is required` | The npm SDK 0.9.0 requires a `version` field in the policy | Use `version: '0.8.0-alpha'`, or use the local build's `/v1` API, which sets it automatically |
| `DACL fallback requires write-DAC permission on 'C:\Program Files\nodejs'` | This machine uses the AppContainer + DACL tier, which edits permissions on each granted folder. Your user can't change permissions on Program Files. | Don't grant those folders, or run `sdk\node\bin\x64\wxc-host-prep.exe prepare-system-drive` once from an admin prompt |
| `whoami: extra operand '/user'` | Harmless: in Git Bash the SDK picks up Git Bash's `whoami` | Ignore it, or use PowerShell/cmd |

---

## 1. Process Container

All three Process Container examples are in `learn/01-process-container/`, and each one has been run to confirm it works. Run them from the repo root:

```
node learn/01-process-container/01-identity.mjs
node learn/01-process-container/02-input-output.mjs
node learn/01-process-container/03-process-config.mjs
```

### What you configure for a Process Container

You write a **policy**. `createConfigFromPolicy()` turns it into a **ContainerConfig** with
`"containment": "process"`, and `wxc-exec.exe` launches your command under an AppContainer identity.

| Setting | Where | What it does |
|---|---|---|
| `filesystem.readonlyPaths` | policy | Folders the sandbox can read but not change |
| `filesystem.readwritePaths` | policy | Folders it can read and write |
| (anything not listed) | — | Access is denied |
| `network.egress` / `ingress` | policy | Outbound and inbound network access (covered in the Network topic) |
| `timeoutMs` | policy | Maximum run time; becomes `process.timeout` |
| `process.commandLine` | config | The command to run |
| `workingDirectory` | spawn argument | Folder the process starts in. **It must be a granted folder.** |
| `env` | spawn argument | Environment variables passed in |
| `processContainer.leastPrivilege`, `capabilities`, `learningMode` | config | Options specific to the Process Container |

A minimal policy:

```js
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
```

The ContainerConfig it generates:

```json
{
  "version": "1.0.0",
  "containerId": "45eeabc7ea62d7df51eb1c7928c01a25",
  "lifecycle": { "destroyOnExit": true, "preservePolicy": false },
  "process": { "commandLine": "", "timeout": 30000 },
  "filesystem": { "readwritePaths": [], "readonlyPaths": [], "deniedPaths": [] },
  "network": {
    "egress": { "default": "deny" },
    "ingress": { "default": "deny", "hostLoopback": "deny" }
  },
  "containment": "process"
}
```

### Example 1: `01-identity.mjs` — what a process container is

It prints the generated ContainerConfig, then shows what the sandboxed process sees:
- Its `%TEMP%` is a private folder, `...\Packages\<container-id>\AC\Temp`, separate from yours. The ID changes on every run.
- It can write to its own Temp, but listing your Documents returns `Access is denied`.

### Example 2: `02-input-output.mjs` — read-only input, read-write output

| Action | Result |
|---|---|
| Read the input file | ✅ allowed |
| Sort the input and write a report to the output folder | ✅ allowed |
| Append to the read-only input | ❌ Access is denied |
| Delete the read-only input | ❌ Access is denied |
| Read `secret\password.txt` (never granted) | ❌ Access is denied |

A final check from outside the sandbox confirms the input is unchanged and the report was written.

### Example 3: `03-process-config.mjs` — process settings

It uses `spawnSandboxFromConfig`, which streams output live instead of waiting for the end.
It passes `JOB_NAME` and `MODE` as environment variables and sets the working directory.
The output shows timestamped progress lines arriving while the job runs, and the job's own
exit code (7) coming back through the sandbox.

```js
const config = createConfigFromPolicy(policy);
config.process.commandLine = 'cmd /c ...';
config.processContainer = { ...config.processContainer, leastPrivilege: false };

const env = { ...process.env, JOB_NAME: 'nightly-report', MODE: 'demo' };
const child = spawnSandboxFromConfig(config, { usePty: false }, workDir, env);
child.stdout.on('data', (d) => process.stdout.write(d));
child.on('close', (code) => console.log('exit code:', code));
```

### Example 4: `04-no-node.json` — no Node.js required

MXC doesn't need Node.js. The engine (`wxc-exec.exe` / `mxc_ffi.dll`, written in Rust)
enforces the policy, and its only input is a JSON ContainerConfig. Each SDK just builds that JSON.

```
.\sdk\node\bin\x64\wxc-exec.exe learn\01-process-container\04-no-node.json
```

Output (exit code 1 is expected, because the last command is blocked from reading Documents):

```
Hello from MXC without Node.js
GREETING=hi-from-json
cwd=C:\path\to\mxc\learn\01-process-container\work
Access is denied.
```

| Ways to use MXC | How it reaches the engine |
|---|---|
| **Command line**: `wxc-exec.exe config.json` (add `--debug` for detail) | Directly. No SDK, no Node. |
| **Node.js SDK** | `createConfigFromPolicy()` builds the JSON. `spawnSandboxAsync` calls `mxc_ffi.dll` inside the Node process; `spawnSandboxFromConfig` starts `wxc-exec.exe` as a child process. |
| **.NET SDK**: `Microsoft.Mxc.Sdk` | Calls `mxc_ffi.dll` |
| **Rust SDK**: `mxc-sdk` crate | Runs the engine inside your program |

How Node options map to the JSON:

| Node | JSON |
|---|---|
| `workingDirectory` argument | `process.cwd` |
| `env` argument | `process.env: ["KEY=VALUE"]`, plus `inheritDefaultEnv: true` to keep the default variables |
| `timeoutMs` | `process.timeout` |
| `filesystem`, `network` | same names |

### Things learned

- **Always set a working directory the sandbox can use.** Otherwise it inherits yours, can't access it, and child commands fail with `The current directory is invalid`.
- **Some Windows tools won't start inside the sandbox.** `whoami.exe` fails with 0xC0000142 ("DLL initialization failed"), because the Windows UI library it loads is disabled by default.
- **`deniedPaths` isn't enforced on Windows yet**, but anything you don't grant is already denied, so you rarely need it.
- **`spawnSandboxAsync` versus `spawnSandboxFromConfig`:** the first waits and returns `{ stdout, stderr, exitCode }`; the second returns a live process so output streams as it happens.
- **A `cmd` gotcha, not specific to MXC:** in `for ... do (...) & next`, everything after `do` belongs to the loop body. Wrap the loop in parentheses to end it.
- **The sandbox runs on your own Windows kernel.** The process container is not a VM: it is a normal process with an AppContainer identity, so it starts almost instantly and can use installed programs such as `cmd.exe`. The README notes that no MXC profile should yet be treated as a security boundary.

---

## 2. Windows Sandbox

Runs your command in a **full, disposable Windows desktop VM**. It's an **experimental** backend,
so every command needs `--experimental`. Windows allows only **one** sandbox VM at a time.

MXC can drive it in two ways (details in `MXC-Info.md`):

- **One-shot:** each run boots a fresh VM, runs one command, and closes it. Examples in `learn/04-windows-sandbox/`.
- **State-aware:** one VM is started once and runs many commands. Examples in `learn/05-windows-sandbox-state-aware/`.

### Before every run: clear any leftover VM

After a one-shot run, the VM can keep running for 40 s to several minutes, and a new run then fails
(see [Things learned](#things-learned-1)). From an **admin** PowerShell:

```powershell
Get-Process WindowsSandbox*, vmwp, vmmemWindowsSandbox -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process WindowsSandbox*, vmwp, vmmemWindowsSandbox -ErrorAction SilentlyContinue    # should print nothing
```

This also stops the `vmwp` of any other Hyper-V VM. If you run other VMs, use `hcsdiag list` and
`hcsdiag kill <id>` instead.

### Watching it run

Hyper-V Manager **doesn't** show Windows Sandbox. Watch the processes in a second window instead:

```powershell
while ($true) { Clear-Host; Get-Date -Format HH:mm:ss; Get-Process | Where-Object Name -match 'Sandbox|vmmem|vmwp|wxc' | Format-Table Name, Id, @{n='MB';e={[int]($_.WorkingSet64/1MB)}} -AutoSize; Start-Sleep 1 }
```

or, from an admin PowerShell while it's running: `hcsdiag list`.

| Process | What it is |
|---|---|
| `wxc-exec` | The MXC engine |
| `WindowsSandbox` | Started by MXC with a generated `.wsb` file |
| `WindowsSandboxRemoteSession` | The window showing the sandbox desktop |
| `WindowsSandboxServer` | Host-side service for the sandbox |
| `vmwp` | Hyper-V worker process: the actual VM |
| `vmmemWindowsSandbox` | The VM's memory (~1–2.5 GB) |

### One-shot examples

```powershell
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\04-windows-sandbox\01-hello.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\04-windows-sandbox\02-mapped-folders.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\04-windows-sandbox\03-stay-60s.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\04-windows-sandbox\04-network-ping.json
```

Add `--debug` after `--experimental` for more detail.

| Example | What it shows |
|---|---|
| `01-hello.json` | Random computer name, user `WDAGUtilityAccount`, `network : blocked`. Ends with `exit 3` on purpose, to show the exit code reaching the host. |
| `02-mapped-folders.json` | `input\` shared read-only, `output\` read-write. The write to `input` is `BLOCKED`. |
| `03-stay-60s.json` | Keeps the sandbox up for 60 s so you can look around. Change `60..1` for longer, and raise `timeout` past 5 min. |
| `04-network-ping.json` | Ping fails, the command re-opens the guest firewall, then ping to `google.com` works. |

Check the mapped-folders result:

```powershell
Get-Content learn\04-windows-sandbox\output\summary.txt
Get-Content learn\04-windows-sandbox\input\notes.txt     # should NOT contain "tampered"
```

A successful run shows these `[daemon]` lines:

```
[daemon] launching "C:\WINDOWS\system32\WindowsSandbox.exe" with "...\wxc-windows-sandbox.wsb"
[daemon] rendezvous: guest at 172.22.x.x:49681
[daemon] 4 TCP connections established to 172.22.x.x:49681
[daemon] guest protocol handshake ok (version 1)
[daemon] received Ready from guest agent
```

If it stops after `launching` for more than ~40 s, the VM slot is busy. Press **Ctrl+C**, clear the
leftover VM, and retry. Otherwise it waits the full 6-minute timeout.

### State-aware mode: one VM, many commands

```powershell
.\learn\05-windows-sandbox-state-aware\run-all.ps1
```

Or step by step:

```powershell
$exe = '.\sdk\node\bin\x64\wxc-exec.exe'
$d   = 'learn\05-windows-sandbox-state-aware'

# 1. provision: saves the folder policy, returns an ID. Instant; no VM yet.
& $exe --experimental $d\01-provision.json --operation provision
$id = 'wsb:xxxxxxxx'    # paste the sandboxId it printed

# 2. start: boots the VM (~30-40 s).
& $exe --experimental $d\phase.json --operation start --sandbox-id $id

# 3. exec: run as many times as you like, in the same VM.
& $exe --experimental $d\02-exec-counter.json --operation exec --sandbox-id $id
& $exe --experimental $d\02-exec-counter.json --operation exec --sandbox-id $id

# 4. stop: shuts the VM down and waits until it's gone.
& $exe --experimental $d\phase.json --operation stop --sandbox-id $id

# 5. deprovision: removes the records.
& $exe --experimental $d\phase.json --operation deprovision --sandbox-id $id

Get-Content $d\work\log.txt    # one line per exec, written from inside the sandbox
```

| File | Used for |
|---|---|
| `01-provision.json` | `provision`. Shares `work\` read-write; folder sharing can only be set here. |
| `phase.json` | `start`, `stop`, `deprovision`. Only needs `version`; the ID goes on the command line. |
| `02-exec-counter.json` | `exec`. Adds 1 to a counter inside the sandbox, prints the computer name and boot time, and logs to `work\log.txt`. |

What to look for:

- `exec #1`, `#2`, `#3` with the **same computer name and boot time**: the VM and its files persist between commands.
- Only `start` is slow; each `exec` takes seconds.
- After `stop`, `vmwp` and `vmmemWindowsSandbox` are already gone.
- There's **no idle shutdown**. Always finish with `stop` or `deprovision`.
- `provision` returns `{"result":{"sandboxId":"wsb:<8 hex>"}}`. Config files for later phases have
  no `phase` or `sandboxId`; those go in `--operation` and `--sandbox-id`.
- Write config files with the Write tool or an editor, not `Set-Content -Encoding utf8` in Windows
  PowerShell 5.1: it adds a byte-order mark, and MXC fails with `Invalid version declaration`.

### Things learned

- **Experimental:** without `--experimental`, you get `the 'windows_sandbox' backend is experimental`.
- **One sandbox at a time** is a Windows limit. A second launch fails with error 1220: *"An attempt
  was made to establish a session to a network server, but there are already too many sessions
  established to that server."*
- **One-shot runs don't wait for the VM to shut down.** MXC kills the `WindowsSandbox*` processes,
  but the VM (`vmwp` + `vmmemWindowsSandbox`) belongs to the Hyper-V service. In my runs it stayed up
  for ~40 s to ~7 min afterwards, and stopping it needs admin rights.
- **MXC's "already running?" check only looks for `WindowsSandbox*` processes.** It misses a VM
  that's still shutting down, launches anyway, hits error 1220, and then waits 6 minutes
  (`RENDEZVOUS_TIMEOUT` in `lifecycle/src/rendezvous.rs`).
- **A stray `WindowsSandboxServer` also blocks runs:** *"Windows Sandbox is already running and was
  not started by a disposable MXC run."* Running `wsb list` starts that server, so avoid it before an
  MXC run. `wxc-exec --force-reclaim` can tear down a sandbox MXC didn't start (it may kill a
  sandbox someone else started).
- **The network block is only a firewall inside the guest.** MXC always enables networking in the
  `.wsb` file (the host talks to the guest agent over TCP), then the guest agent sets the firewall to
  block everything except that connection (`guest/src/firewall.rs`). The guest user is an admin, so
  the command can undo it, as `04-network-ping.json` shows. `network: allow` is rejected rather than
  supported.
- **Slow:** each one-shot run took ~39 s, mostly booting Windows. State-aware mode pays that once.

---

## 3. WSL Container (WSLC)

Runs your command in a **Linux container** inside the WSL 2 VM, started from a container image.

```
node learn/02-wsl-container/01-ping.mjs            # pings 1.1.1.1
node learn/02-wsl-container/01-ping.mjs 8.8.8.8    # or any host
```

### Setup

- Needs **WSL 2.9.9+**: `wsl --update --pre-release` (installed here: 3.0.1).
- If `wsl --update` seems to hang after "Updating Windows Subsystem for Linux to version ...", it's waiting on a **UAC prompt hidden behind other windows**. Approve it, or run the downloaded `%TEMP%\wsl.<version>.x64.msi` from an admin prompt.
- MXC must be built with `--with-wslc`.

### Process Container vs WSL Container

| | Process Container | WSL Container |
|---|---|---|
| Runs on | Your Windows kernel | A **Linux** kernel in the WSL 2 VM |
| Commands | Windows (`cmd`, `.exe`) | Linux (`sh`, `ping`, `python3`, ...) |
| Starting point | Your installed programs | A **container image** (default `alpine:latest`; Docker Hub, GHCR or MCR) |
| Your files | Granted folders, at the same Windows paths | Granted folders **mounted** inside: `C:\work` appears as `/mnt/c/work` |
| Network | Separate allow/deny per direction | **All-or-nothing**: egress, ingress and hostLoopback all `allow` (bridged) or all `deny` (isolated). Mixed settings are rejected. |
| Resources | — | `wslc.cpuCount`, `wslc.memoryMb`, `wslc.gpu` |
| Startup | Instant | ~8 s on the first run (image pull), ~4.6 s once cached |

WSLC-specific settings go under `config.wslc`: `image`, `cpuCount`, `memoryMb`, `gpu`, `storagePath` and `imageTarPath`.

### Example 1: `01-ping.mjs` — ping from Linux and report latency

```js
const config = createConfigFromPolicy({
  network: {
    egress: { default: 'allow' },
    ingress: { default: 'allow', hostLoopback: 'allow' },
  },
  timeoutMs: 120_000,
}, 'wslc');                                   // <- choose the WSL Container backend

config.wslc.image = 'alpine:latest';
config.process.commandLine = 'ping -c 3 1.1.1.1';

const child = spawnSandboxFromConfig(config, { usePty: false, skipPlatformCheck: true });
```

Output:

```
[WSLC] Pulling image 'alpine:latest' (up to 540s)
[WSLC] Image 'alpine:latest' pulled
64 bytes from 1.1.1.1: seq=0 ttl=58 time=13.837 ms
64 bytes from 1.1.1.1: seq=1 ttl=58 time=6.235 ms
64 bytes from 1.1.1.1: seq=2 ttl=58 time=7.061 ms

=== Latency to 1.1.1.1 ===
  min 6.235 ms | avg 9.04 ms | max 13.837 ms
exit code: 0 | total time incl. container start: 8.3s
```

### Example 2: `02-ping.json` — the same ping as JSON, no Node

```
.\sdk\node\bin\x64\wxc-exec.exe learn\02-wsl-container\02-ping.json
```

```json
{
  "version": "1.0.0",
  "containment": "wslc",
  "containerId": "learn-wslc-ping",
  "process": {
    "commandLine": "ping -c 3 1.1.1.1 | grep -E 'time=|round-trip'",
    "timeout": 120000
  },
  "network": {
    "egress": { "default": "allow" },
    "ingress": { "default": "allow", "hostLoopback": "allow" }
  },
  "wslc": { "image": "alpine:latest" }
}
```

Output (about 4.8 s):

```
64 bytes from 1.1.1.1: seq=0 ttl=58 time=6.864 ms
64 bytes from 1.1.1.1: seq=1 ttl=58 time=5.024 ms
64 bytes from 1.1.1.1: seq=2 ttl=58 time=6.117 ms
round-trip min/avg/max = 5.024/6.001/6.864 ms
```

The command line runs in a Linux shell, so pipes (`|`) and `&&` work. Here Linux `grep`
does the filtering that the Node script did in JavaScript.

### Things learned

- **WSLC JSON needs a `containerId`.** Without it, `wxc-exec` fails with `WslcCreateSession failed: HRESULT 0x80040608`. The Node SDK always generates one, which is why the Node version worked.
- **`skipPlatformCheck: true` is required in the Node SDK.** Its Windows probe never lists `wslc`, so without the option `spawnSandboxFromConfig` refuses with `Containment backend 'wslc' is not available on this platform`. The native engine still does its own WSLC check.
- **Image download happens outside the sandbox policy.** With network `allow`, a missing image is downloaded automatically on the first run. With network `deny`, a missing image is refused rather than downloaded. Warm the cache first with `wxc-exec.exe --setup-wslc --image alpine:latest`, or supply a local tar with `wslc.imageTarPath`.

---

## 5. MicroVM (NanVix)

Runs **Python source** inside a small **hardware-virtualized micro-VM** on Windows Hypervisor
Platform. The guest is the **NanVix** microkernel OS from Microsoft Research (not Linux, not a
unikernel), started by `nanvixd.exe` from a warm snapshot.

```powershell
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\06-nanvix\01-hello.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\06-nanvix\02-copy-in-out.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\06-nanvix\03-timeout-no-copyback.json   # takes ~63 s
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\06-nanvix\04-network.json
```

### Setup

Nothing to do with this build: `nanvixd.exe`, `python3.initrd` and `nanvix_rootfs.img` are already
next to `wxc-exec.exe` (built with `--with-microvm`). The warm snapshot lives in
`sdk\node\bin\x64\snapshots\` (`kernel.vmem`, 256 MB); if it's missing, the first run cold-boots and
creates it.

### How NanVix differs from Hyperlight

| | Hyperlight | NanVix |
|---|---|---|
| Guest | Unikraft unikernel (Linux-compatible) | NanVix microkernel, 32-bit (`nanvix-0-microvm-32bit`) |
| Languages | Python, Node, shell, .NET | **Python only** (3.12.3) |
| Your files | **Live mounts** at `/host/<name>` | **Copied in** before the run, **copied back** after a normal exit |
| Paths in your script | Guest paths (`/host/output/...`) | **Your Windows paths**; MXC rewrites them to `/mnt/ro/...` or `/mnt/rw/...` |
| Timeout | `timeout` | 60 s boot allowance **+** `timeout` |
| Network | Rejected | All-or-nothing, off by default |
| Warm run | ~150–200 ms | ~260 ms |

### Example 1: `01-hello.json` — what the guest sees

```
Hello from a NanVix micro-VM
python  : 3.12.3
platform: nanvix-0-microvm-32bit
uname   : posix.uname_result(sysname='nanvix', nodename='localhost', release='0', version='16', machine='microvm')
cwd     : /
root fs : ['sysroot']
network : blocked -> gaierror [Errno 88] None
script took 32.0 ms
exit code: 3 | total ~260 ms (warm)
```

### Example 2: `02-copy-in-out.json` — copy in, copy back

`input\` is copied in read-only and `work\` read-write. The script is written with
`C:\path\to\...` paths, but it prints the rewritten guest paths, because **MXC rewrites the path
text inside your source** before it reaches the VM:

```
input is really at: /mnt/ro/c/path/to/mxc/learn/06-nanvix/input
work  is really at: /mnt/rw/c/path/to/mxc/learn/06-nanvix/work
read 4 numbers, sum = 50
wrote result.txt
write to read-only input: BLOCKED -> [Errno 13] P: '/mnt/ro/c/.../input/numbers.txt'
exit code: 0 | total 225 ms
```

```powershell
Get-Content learn\06-nanvix\work\result.txt     # sum=50 count=4  (copied back)
Get-Content learn\06-nanvix\input\numbers.txt   # unchanged
```

### Example 3: `03-timeout-no-copyback.json` — a timed-out run leaves no trace

The script writes `work\partial.txt`, then sleeps 120 s with `timeout: 3000`.

```
wrote partial.txt, now sleeping past the timeout...
{"error":{"code":"backend_error","message":"NanVix execution timed out after 63000ms (boot_timeout=60000ms, script_timeout=3000ms)"}}
```

```powershell
Test-Path learn\06-nanvix\work\partial.txt      # False: nothing copied back
```

With a 30 s sleep it finishes normally (30 s < 63 s), and `partial.txt` **is** copied back.

### Example 4: `04-network.json` — network allowed (not working yet)

All three directions are set to `allow`, which is the only way to turn networking on.
`--debug` shows `NanVix: host networking enabled`, and MXC passes `-allow-host-networking` to
`nanvixd`, but every attempt still fails inside the guest, even to a plain IP:

```
1.1.1.1        -> failed: [Errno 88] None
google.com     -> failed: [Errno 88] None
microsoft.com  -> failed: [Errno 88] None
```

Unresolved: it may be the guest's Python socket support or this NanVix runtime version.

### Things learned

- **NanVix works on this laptop**, unlike NVX, which needs a supported Xeon CPU (see `MXC-Info.md`).
- **The 4 GB-per-file limit** (FAT32 staging) and **no `deniedPaths`** (rejected) are other limits.
- **Copy-back only happens after a normal exit**, including a non-zero exit code. A timeout, crash,
  or runtime error copies nothing back.
- **The real timeout is `timeout` + 60 s**, so a short `timeout` doesn't stop a script quickly.
- **`workingDirectory` isn't supported**; the guest's working directory is always `/`.

---

## 6. Hyperlight MicroVM

Runs **source code** (Python, Node, shell, .NET) inside a tiny **hardware-virtualized micro-VM**
on Windows Hypervisor Platform (the Hyper-V platform). The guest is a **Unikraft unikernel**, not a full
Windows or Linux OS, and every run restores a warm snapshot, so a whole run takes about **150–200 ms**.

```
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\03-hyperlight\01-hello.json
.\sdk\node\bin\x64\wxc-exec.exe --experimental learn\03-hyperlight\02-mounts.json
```

### Setup (once per machine)

```
.\sdk\node\bin\x64\wxc-exec.exe --setup-hyperlight=python
```

This took 1.8 s: a 13 MiB guest image was pulled from `ghcr.io/hyperlight-dev/hyperlight-unikraft/python`,
booted once, and saved as a warm snapshot in `%LOCALAPPDATA%\mxc-hyperlight\python\`.

| `hyperlight.runtime` | Guest |
|---|---|
| `agent` (default) | Python 3.12 with numpy, pandas, scipy, scikit-learn, requests, ... (largest) |
| `python` | Python 3.12 (used here) |
| `python-shell` | Python 3.12 with a BusyBox shell |
| `node` | Node.js 22 |
| `bash` | BusyBox POSIX shell |
| `dotnet-jit` | .NET |

Install others with `--setup-hyperlight=agent,node`.

### How Hyperlight differs

| | Process Container | WSL Container | Hyperlight |
|---|---|---|---|
| Isolation | AppContainer, on your Windows kernel | Linux container in the WSL 2 VM | **Own micro-VM** (hardware virtualization) |
| `commandLine` is | A Windows command | A Linux shell command | **Source code** for the guest runtime |
| Your files | Same Windows paths | `C:\x` appears as `/mnt/c/x` | Mounted at **`/host/<foldername>`** |
| Network | Allow/deny per direction | All-or-nothing | **None.** A `network` section is rejected before the run. |
| Working directory | Supported | Supported | Rejected: the guest has its own filesystem |
| Requires | — | WSL 2.9.9+ | `--experimental`, schema `1.1.0-alpha`, `--with-hyperlight` build |
| Run time | Instant | ~4.6 s | **~150–200 ms** |

### Example 1: `01-hello.json` — what the guest sees

A Python script prints details about the guest, tries the network, and exits with code 3.

```
Hello from a Hyperlight micro-VM
python  : 3.12.14
platform: Unikraft 5.15.148-Ijiraq x86_64
cpus    : 1
root fs : ['.dockerenv', 'dev', 'etc', 'lib', 'lib64', 'proc', 'sys', 'tmp', 'usr']
network : blocked -> PermissionError [Errno 13] Permission denied
script took 12.8 ms
exit code: 3 | total 190ms
```

- The guest has its own tiny filesystem; nothing from your host is visible unless mounted.
- The script's own exit code (3) comes back to Windows.
- The `hl_driver: dispatch callback failed` line printed on `sys.exit` seems to be harmless noise from the guest driver.

### Example 2: `02-mounts.json` — process host files inside the VM

`input\` is mounted read-only and `output\` read-write. The script totals `input\sales.csv` by product
and writes `output\report.txt`.

```json
"filesystem": {
  "readonlyPaths":  ["C:\...\learn\03-hyperlight\input"],
  "readwritePaths": ["C:\...\learn\03-hyperlight\output"]
}
```

```
mounted under /host: ['input', 'output']
wrote /host/output/report.txt:
apples     135.20
pears      116.75
write to read-only input: BLOCKED -> [Errno 30] Read-only file system: '/host/input/sales.csv'
exit code: 0 | total 152ms
```

Checked from Windows afterwards: `output\report.txt` contains the report, and `input\sales.csv` is unchanged.

### Things learned

- **The script is the command.** Put Python source in `commandLine`, with `\n` for newlines in JSON.
- **Each mount appears as `/host/<basename>`**, so two mounted folders can't share a name, and names can't contain spaces, `:` or brackets.
- **Read-only is enforced twice**, by the guest kernel and by the host.
- **Every run starts from the same snapshot**, so nothing carries over from one run to the next.
