# Walks a Windows Sandbox through the full state-aware lifecycle:
#   provision -> start -> exec x3 -> stop -> deprovision
# Run from the repo root:  .\learn\05-windows-sandbox-state-aware\run-all.ps1

$ErrorActionPreference = 'Stop'
$exe  = '.\sdk\node\bin\x64\wxc-exec.exe'
$here = 'learn\05-windows-sandbox-state-aware'

function Step($title, [string[]]$wxcArgs) {
    Write-Host "`n=== $title ===" -ForegroundColor Cyan
    Write-Host "> wxc-exec $($wxcArgs -join ' ')" -ForegroundColor DarkGray
    $t = Get-Date
    $out = & $exe --experimental @wxcArgs
    $code = $LASTEXITCODE
    $out | ForEach-Object { Write-Host $_ }
    Write-Host ("exit code: {0} | took {1:N1}s" -f $code, ((Get-Date) - $t).TotalSeconds) -ForegroundColor DarkGray
    if ($code -ne 0) { throw "$title failed (exit $code)" }
    return $out
}

Remove-Item "$here\work\log.txt" -ErrorAction SilentlyContinue

# 1. provision: records the filesystem policy and returns an ID. No VM yet.
$prov = Step 'provision' @("$here\01-provision.json", '--operation', 'provision')
$id = ($prov | Out-String | ConvertFrom-Json).result.sandboxId
Write-Host "sandbox ID: $id" -ForegroundColor Green

try {
    # 2. start: launches the daemon + VM and waits until the guest is ready (the slow part).
    Step 'start' @("$here\phase.json", '--operation', 'start', '--sandbox-id', $id) | Out-Null

    # 3. exec three times in the SAME VM: the counter keeps going up and the boot time stays the same.
    foreach ($i in 1..3) {
        Step "exec $i" @("$here\02-exec-counter.json", '--operation', 'exec', '--sandbox-id', $id) | Out-Null
    }

    # 4. stop: shuts the VM down and WAITS until it is gone.
    Step 'stop' @("$here\phase.json", '--operation', 'stop', '--sandbox-id', $id) | Out-Null
}
finally {
    # 5. deprovision: removes the records (and stops the VM first if it is still running).
    Step 'deprovision' @("$here\phase.json", '--operation', 'deprovision', '--sandbox-id', $id) | Out-Null
}

Write-Host "`n=== Written to the mapped folder (read on the host) ===" -ForegroundColor Cyan
Get-Content "$here\work\log.txt"
Write-Host "`n=== Sandbox processes left (should be none) ===" -ForegroundColor Cyan
Get-Process WindowsSandbox*, vmwp, vmmemWindowsSandbox -ErrorAction SilentlyContinue | Format-Table Name, Id -AutoSize
