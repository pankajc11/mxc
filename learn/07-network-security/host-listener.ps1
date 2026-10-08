# Host-side TCP listener on 127.0.0.1:<port>. Logs every connection it accepts, so you can tell
# whether a sandbox reached a service bound to the host's loopback.
# Usage: .\learn\07-network-security\host-listener.ps1 [-Port 18080] [-Seconds 120]
param([int]$Port = 18080, [int]$Seconds = 120)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host ("[{0:HH:mm:ss}] listening on 127.0.0.1:{1} for {2}s" -f (Get-Date), $Port, $Seconds)
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
    if ($listener.Pending()) {
        $c = $listener.AcceptTcpClient()
        $ep = $c.Client.RemoteEndPoint
        $owner = (Get-NetTCPConnection -LocalPort $ep.Port -State Established -ErrorAction SilentlyContinue |
                  Select-Object -First 1).OwningProcess
        $name = if ($owner) { (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName } else { '?' }
        Write-Host ("[{0:HH:mm:ss}] ACCEPTED from {1}  (client PID {2} {3})" -f (Get-Date), $ep, $owner, $name)
        $w = [System.IO.StreamWriter]::new($c.GetStream()); $w.WriteLine('hello from the host'); $w.Flush()
        $c.Close()
    }
    Start-Sleep -Milliseconds 100
}
$listener.Stop()
Write-Host ("[{0:HH:mm:ss}] stopped" -f (Get-Date))
