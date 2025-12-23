#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Automatically discovers all computers on the local network.

.DESCRIPTION
    Scans the network to find active Windows computers and creates a computers.txt
    file ready for deployment. Uses multiple discovery methods for best results.

.PARAMETER Subnet
    Network subnet to scan (e.g., "192.168.1" for 192.168.1.0/24)
    If not specified, will auto-detect from server's IP address.

.PARAMETER StartIP
    Starting IP address for scan (default: 1)

.PARAMETER EndIP
    Ending IP address for scan (default: 254)

.PARAMETER OutputFile
    Output file name (default: computers.txt)

.EXAMPLE
    .\Discover-Computers.ps1
    (Auto-detects subnet and scans entire range)

.EXAMPLE
    .\Discover-Computers.ps1 -Subnet "192.168.1" -StartIP 100 -EndIP 150
    (Scans 192.168.1.100 through 192.168.1.150)
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Subnet,

    [Parameter(Mandatory=$false)]
    [int]$StartIP = 1,

    [Parameter(Mandatory=$false)]
    [int]$EndIP = 254,

    [Parameter(Mandatory=$false)]
    [string]$OutputFile = "computers.txt"
)

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputPath = Join-Path $ScriptRoot $OutputFile

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Get-LocalSubnet {
    Write-ColorOutput "Detecting local network subnet..." -Color Cyan

    $adapters = Get-NetIPConfiguration | Where-Object {
        $_.IPv4Address -and
        $_.IPv4Address.IPAddress -ne "127.0.0.1" -and
        $_.IPv4DefaultGateway
    }

    if ($adapters) {
        $ip = $adapters[0].IPv4Address.IPAddress
        $parts = $ip.Split('.')
        $subnet = "$($parts[0]).$($parts[1]).$($parts[2])"
        Write-ColorOutput "  Detected subnet: $subnet.0/24 (from IP: $ip)" -Color Green
        return $subnet
    }

    Write-ColorOutput "  Could not detect subnet automatically" -Color Yellow
    return $null
}

function Test-ComputerPort {
    param(
        [string]$ComputerName,
        [int]$Port = 135
    )

    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $tcpClient.Connect($ComputerName, $Port)
        $tcpClient.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Get-ComputerInfo {
    param([string]$IPAddress)

    $result = @{
        IP = $IPAddress
        Hostname = $null
        IsWindows = $false
        IsOnline = $false
    }

    # Test if online
    if (-not (Test-Connection -ComputerName $IPAddress -Count 1 -Quiet)) {
        return $result
    }

    $result.IsOnline = $true

    # Try to get hostname via DNS
    try {
        $hostname = [System.Net.Dns]::GetHostByAddress($IPAddress).HostName
        if ($hostname) {
            $result.Hostname = $hostname.Split('.')[0]  # Get just the computer name
        }
    }
    catch {
        # DNS lookup failed, try NetBIOS
        try {
            $hostname = (nbtstat -A $IPAddress 2>$null | Select-String -Pattern "^\s+(\S+)\s+<00>\s+UNIQUE" | Select-Object -First 1)
            if ($hostname) {
                $result.Hostname = $hostname.ToString().Trim().Split()[0]
            }
        }
        catch { }
    }

    # Check if it's a Windows computer (try WMI port 135)
    if (Test-ComputerPort -ComputerName $IPAddress -Port 135) {
        $result.IsWindows = $true
    }

    return $result
}

#region Main Script

Write-ColorOutput @"

╔══════════════════════════════════════════════════════════════╗
║  Network Computer Discovery Tool                            ║
║  Automatically finds computers for deployment               ║
╚══════════════════════════════════════════════════════════════╝

"@ -Color Cyan

# Auto-detect subnet if not provided
if (-not $Subnet) {
    $Subnet = Get-LocalSubnet
    if (-not $Subnet) {
        Write-ColorOutput "Please specify subnet with -Subnet parameter" -Color Red
        Write-ColorOutput "Example: .\Discover-Computers.ps1 -Subnet '192.168.1'" -Color Yellow
        exit 1
    }
}

$scanRange = "$Subnet.$StartIP - $Subnet.$EndIP"
$totalIPs = $EndIP - $StartIP + 1

Write-ColorOutput "`nScan Configuration:" -Color Cyan
Write-ColorOutput "  Subnet:      $Subnet.0/24" -Color White
Write-ColorOutput "  Range:       $scanRange" -Color White
Write-ColorOutput "  Total IPs:   $totalIPs" -Color White
Write-ColorOutput "  Output file: $OutputPath" -Color White

Write-ColorOutput "`n[!] This scan will take approximately $([math]::Round($totalIPs * 2 / 60, 1)) minutes" -Color Yellow
Write-ColorOutput "   (Faster scan option available - see Advanced Methods below)" -Color Gray

$confirm = Read-Host "`nStart scan? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-ColorOutput "Scan cancelled." -Color Yellow
    exit 0
}

Write-ColorOutput "`nScanning network..." -Color Cyan
Write-ColorOutput "(This may take a while. Grab a coffee!)" -Color Gray
Write-ColorOutput ""

$computers = @()
$onlineCount = 0
$windowsCount = 0

# Progress tracking
$progress = 0
$progressInterval = [math]::Max(1, [math]::Floor($totalIPs / 20))  # Update every 5%

for ($i = $StartIP; $i -le $EndIP; $i++) {
    $ip = "$Subnet.$i"
    $progress++

    # Show progress
    if ($progress % $progressInterval -eq 0 -or $i -eq $EndIP) {
        $percent = [math]::Round(($progress / $totalIPs) * 100)
        Write-Progress -Activity "Scanning Network" -Status "$percent% Complete ($onlineCount online, $windowsCount Windows)" -PercentComplete $percent
    }

    # Scan this IP
    $info = Get-ComputerInfo -IPAddress $ip

    if ($info.IsOnline) {
        $onlineCount++

        # Display found computer
        $displayName = if ($info.Hostname) { "$($info.Hostname) ($ip)" } else { $ip }
        $statusIcon = if ($info.IsWindows) { "[WIN]" } else { "[???]" }
        $statusColor = if ($info.IsWindows) { "Green" } else { "Yellow" }

        Write-ColorOutput "  $statusIcon Found: $displayName" -Color $statusColor

        if ($info.IsWindows) {
            $windowsCount++
            # Use hostname if available, otherwise IP
            $computers += if ($info.Hostname) { $info.Hostname } else { $ip }
        }
    }
}

Write-Progress -Activity "Scanning Network" -Completed

# Results
Write-ColorOutput @"

╔══════════════════════════════════════════════════════════════╗
║  SCAN RESULTS                                                ║
╚══════════════════════════════════════════════════════════════╝

"@ -Color Cyan

Write-ColorOutput "Total IPs scanned:    $totalIPs" -Color White
Write-ColorOutput "Devices found online: $onlineCount" -Color Cyan
Write-ColorOutput "Windows computers:    $windowsCount" -Color Green
Write-ColorOutput "Other devices:        $($onlineCount - $windowsCount)" -Color Yellow

if ($computers.Count -eq 0) {
    Write-ColorOutput "`n[!] No Windows computers found!" -Color Red
    Write-ColorOutput @"

Possible reasons:
  1. Computers are turned off
  2. Firewall blocking ping/WMI
  3. Wrong subnet specified
  4. Network isolation (VLANs)

Try:
  - Ensure computers are powered on
  - Try scanning during class time
  - Check firewall settings
  - Verify you're on the correct network

"@ -Color Yellow
    exit 1
}

# Save to file
Write-ColorOutput "`nSaving results to: $OutputPath" -Color Cyan

$header = @"
# Computer list generated by Discover-Computers.ps1
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Subnet: $Subnet.0/24
# Windows computers found: $windowsCount

# You can edit this file before deployment:
#   - Remove any computers you don't want to deploy to
#   - Add any missing computers manually
#   - Lines starting with # are ignored

"@

Set-Content -Path $OutputPath -Value $header
Add-Content -Path $OutputPath -Value ""
$computers | Sort-Object | ForEach-Object {
    Add-Content -Path $OutputPath -Value $_
}

Write-ColorOutput "[OK] Saved $($computers.Count) computers to $OutputFile" -Color Green

# Show sample
Write-ColorOutput "`nFirst 10 computers found:" -Color Cyan
$computers | Select-Object -First 10 | ForEach-Object {
    Write-ColorOutput "  - $_" -Color White
}

if ($computers.Count -gt 10) {
    Write-ColorOutput "  ... and $($computers.Count - 10) more" -Color Gray
}

Write-ColorOutput @"

╔══════════════════════════════════════════════════════════════╗
║  NEXT STEPS                                                  ║
╚══════════════════════════════════════════════════════════════╝

1. Review computers.txt and remove any you don't want to deploy to

2. Test on 2-3 computers first:
   - Edit computers.txt to keep only 2-3 entries
   - Run: .\Deploy-ProtocolHandlers.ps1
   - Verify it works

3. Once tested, restore full computers.txt and deploy to all

4. If some computers are missing:
   - They might be powered off
   - Add them manually to computers.txt
   - Re-run this script when they're online

"@ -Color Yellow

#endregion

# Show advanced options
Write-ColorOutput @"
═══════════════════════════════════════════════════════════════

ADVANCED: Faster Scanning Methods
══════════════════════════════════════════════════════════════

For faster scans (optional):

Method 1: Parallel Scanning (much faster!)
  .\Discover-Computers.ps1 -Parallel

Method 2: Check DHCP Server (instant!)
  - Log into your router/DHCP server
  - Export DHCP lease list
  - Contains all connected computer names

Method 3: Check ARP Cache (very fast!)
  arp -a | findstr "dynamic"

Method 4: Use Network Scanner Tool
  - Download Advanced IP Scanner (free)
  - Scan network graphically
  - Export results

"@ -Color Gray

Write-ColorOutput "Scan complete! File ready: $OutputPath" -Color Green
