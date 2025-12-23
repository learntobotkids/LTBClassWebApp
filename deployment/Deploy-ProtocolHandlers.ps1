#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Remotely deploys LearnToBot protocol handlers to multiple Windows computers.

.DESCRIPTION
    This script installs the studentfolder:// and studentfile:// protocol handlers
    on all specified computers via PowerShell remoting.

.PARAMETER ComputerNames
    Array of computer names or IP addresses to deploy to.
    Can also read from computers.txt file.

.PARAMETER Credential
    Credentials for remote access. If not provided, will prompt.

.EXAMPLE
    .\Deploy-ProtocolHandlers.ps1
    (Will read from computers.txt and prompt for credentials)

.EXAMPLE
    .\Deploy-ProtocolHandlers.ps1 -ComputerNames "PC-01","PC-02","PC-03"
#>

param(
    [Parameter(Mandatory=$false)]
    [string[]]$ComputerNames,

    [Parameter(Mandatory=$false)]
    [PSCredential]$Credential
)

# Configuration
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFolder = "C:\LearnToBot"
$OpenFolderBat = Join-Path $ScriptRoot "OpenStudentFolder.bat"
$OpenFileBat = Join-Path $ScriptRoot "OpenStudentFile.bat"
$RegFile = Join-Path $ScriptRoot "RegisterProtocols.reg"

# Results tracking
$SuccessCount = 0
$FailCount = 0
$Results = @()

#region Functions

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Test-RemoteConnection {
    param([string]$ComputerName)

    Write-ColorOutput "Testing connection to $ComputerName..." -Color Cyan

    # Test if computer is reachable
    if (-not (Test-Connection -ComputerName $ComputerName -Count 1 -Quiet)) {
        Write-ColorOutput "  ✗ Cannot reach $ComputerName" -Color Red
        return $false
    }

    # Test if WinRM is enabled
    try {
        $null = Invoke-Command -ComputerName $ComputerName -ScriptBlock { $env:COMPUTERNAME } -ErrorAction Stop
        Write-ColorOutput "  ✓ Connection successful" -Color Green
        return $true
    }
    catch {
        Write-ColorOutput "  ✗ WinRM not accessible: $_" -Color Red
        return $false
    }
}

function Install-ProtocolHandler {
    param(
        [string]$ComputerName,
        [PSCredential]$Credential
    )

    Write-ColorOutput "`nInstalling on $ComputerName..." -Color Yellow

    try {
        # Prepare session parameters
        $sessionParams = @{
            ComputerName = $ComputerName
            ErrorAction = 'Stop'
        }
        if ($Credential) {
            $sessionParams.Credential = $Credential
        }

        # Create remote session
        $session = New-PSSession @sessionParams

        # Copy files to remote computer
        Write-ColorOutput "  → Copying files..." -Color Gray

        # Create destination folder
        Invoke-Command -Session $session -ScriptBlock {
            if (-not (Test-Path "C:\LearnToBot")) {
                New-Item -Path "C:\LearnToBot" -ItemType Directory -Force | Out-Null
            }
        }

        # Copy batch files
        Copy-Item -Path $OpenFolderBat -Destination "C:\LearnToBot\" -ToSession $session -Force
        Copy-Item -Path $OpenFileBat -Destination "C:\LearnToBot\" -ToSession $session -Force

        Write-ColorOutput "  → Registering protocols..." -Color Gray

        # Import registry settings
        Invoke-Command -Session $session -ScriptBlock {
            param($RegContent)

            # Save reg content to temp file
            $tempReg = Join-Path $env:TEMP "LearnToBot_Protocols.reg"
            Set-Content -Path $tempReg -Value $RegContent -Force

            # Import registry
            $process = Start-Process -FilePath "reg.exe" -ArgumentList "import `"$tempReg`"" -Wait -PassThru -NoNewWindow

            # Clean up
            Remove-Item -Path $tempReg -Force

            return $process.ExitCode
        } -ArgumentList (Get-Content $RegFile -Raw)

        # Close session
        Remove-PSSession -Session $session

        Write-ColorOutput "  ✓ Installation completed successfully on $ComputerName" -Color Green

        $script:SuccessCount++
        return @{
            ComputerName = $ComputerName
            Status = "Success"
            Message = "Installed successfully"
        }
    }
    catch {
        Write-ColorOutput "  ✗ Failed: $_" -Color Red

        $script:FailCount++
        return @{
            ComputerName = $ComputerName
            Status = "Failed"
            Message = $_.Exception.Message
        }
    }
}

function Enable-PSRemoting-Remotely {
    param([string]$ComputerName)

    Write-ColorOutput "Attempting to enable PSRemoting on $ComputerName..." -Color Cyan

    try {
        # Try using psexec if available
        $psexec = Get-Command psexec.exe -ErrorAction SilentlyContinue
        if ($psexec) {
            $result = & psexec.exe \\$ComputerName -s powershell.exe Enable-PSRemoting -Force
            Write-ColorOutput "  ✓ PSRemoting enabled" -Color Green
            return $true
        }
        else {
            Write-ColorOutput "  ! PSExec not found. Cannot enable remotely." -Color Yellow
            Write-ColorOutput "  ! Please enable PSRemoting manually on $ComputerName" -Color Yellow
            return $false
        }
    }
    catch {
        Write-ColorOutput "  ✗ Failed to enable PSRemoting: $_" -Color Red
        return $false
    }
}

#endregion

#region Main Script

Write-ColorOutput @"

╔══════════════════════════════════════════════════════════════╗
║  LearnToBot Protocol Handler Remote Deployment              ║
║  Installs studentfolder:// and studentfile:// protocols     ║
╚══════════════════════════════════════════════════════════════╝

"@ -Color Cyan

# Verify required files exist
Write-ColorOutput "Checking required files..." -Color Cyan
$missingFiles = @()
if (-not (Test-Path $OpenFolderBat)) { $missingFiles += "OpenStudentFolder.bat" }
if (-not (Test-Path $OpenFileBat)) { $missingFiles += "OpenStudentFile.bat" }
if (-not (Test-Path $RegFile) ) { $missingFiles += "RegisterProtocols.reg" }

if ($missingFiles.Count -gt 0) {
    Write-ColorOutput "✗ Missing required files:" -Color Red
    $missingFiles | ForEach-Object { Write-ColorOutput "  - $_" -Color Red }
    Write-ColorOutput "`nPlease run this script from the deployment folder." -Color Yellow
    exit 1
}
Write-ColorOutput "✓ All required files found" -Color Green

# Get computer names
if (-not $ComputerNames) {
    $computersFile = Join-Path $ScriptRoot "computers.txt"

    if (Test-Path $computersFile) {
        Write-ColorOutput "`nReading computer names from computers.txt..." -Color Cyan
        $ComputerNames = Get-Content $computersFile | Where-Object { $_.Trim() -ne "" -and -not $_.StartsWith("#") }
        Write-ColorOutput "Found $($ComputerNames.Count) computers" -Color Green
    }
    else {
        Write-ColorOutput @"

No computer names provided and computers.txt not found.

Please either:
  1. Create a computers.txt file with one computer name/IP per line
  2. Run with -ComputerNames parameter

Example computers.txt:
  CLASSROOM-PC-01
  CLASSROOM-PC-02
  192.168.1.100
  192.168.1.101

"@ -Color Yellow
        exit 1
    }
}

# Get credentials if not provided
if (-not $Credential) {
    Write-ColorOutput "`nPlease enter credentials for remote access:" -Color Cyan
    Write-ColorOutput "(Use an account with Administrator rights on the target computers)" -Color Gray
    $Credential = Get-Credential -Message "Enter admin credentials"
}

# Confirm before proceeding
Write-ColorOutput "`n═══════════════════════════════════════════════" -Color Cyan
Write-ColorOutput "Ready to deploy to $($ComputerNames.Count) computers" -Color Yellow
Write-ColorOutput "═══════════════════════════════════════════════`n" -Color Cyan

$confirm = Read-Host "Continue? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-ColorOutput "Deployment cancelled." -Color Yellow
    exit 0
}

# Deploy to each computer
Write-ColorOutput "`n`nStarting deployment...`n" -Color Cyan

foreach ($computer in $ComputerNames) {
    $computer = $computer.Trim()
    if ([string]::IsNullOrEmpty($computer)) { continue }

    # Test connection
    if (-not (Test-RemoteConnection -ComputerName $computer)) {
        $Results += @{
            ComputerName = $computer
            Status = "Failed"
            Message = "Connection failed or WinRM not available"
        }
        $script:FailCount++
        continue
    }

    # Install
    $result = Install-ProtocolHandler -ComputerName $computer -Credential $Credential
    $Results += $result

    Start-Sleep -Seconds 1
}

# Summary
Write-ColorOutput @"

╔══════════════════════════════════════════════════════════════╗
║  DEPLOYMENT SUMMARY                                          ║
╚══════════════════════════════════════════════════════════════╝

"@ -Color Cyan

Write-ColorOutput "Total Computers: $($ComputerNames.Count)" -Color White
Write-ColorOutput "Successful:      $SuccessCount" -Color Green
Write-ColorOutput "Failed:          $FailCount" -Color Red

if ($FailCount -gt 0) {
    Write-ColorOutput "`nFailed Computers:" -Color Yellow
    $Results | Where-Object { $_.Status -eq "Failed" } | ForEach-Object {
        Write-ColorOutput "  • $($_.ComputerName): $($_.Message)" -Color Red
    }
}

if ($SuccessCount -gt 0) {
    Write-ColorOutput "`nSuccessful Computers:" -Color Green
    $Results | Where-Object { $_.Status -eq "Success" } | ForEach-Object {
        Write-ColorOutput "  • $($_.ComputerName)" -Color Green
    }
}

# Export results to CSV
$resultsFile = Join-Path $ScriptRoot "deployment-results-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
$Results | ForEach-Object { [PSCustomObject]$_ } | Export-Csv -Path $resultsFile -NoTypeInformation
Write-ColorOutput "`nDetailed results saved to: $resultsFile" -Color Cyan

Write-ColorOutput "`nDeployment complete!" -Color Green
Write-ColorOutput @"

NEXT STEPS:
  1. Test on a few computers by opening:
     http://[SERVER-IP]:3000/student-files.html
  2. Click 'Open in Explorer' - folder should open
  3. Click any file - should open with default program

If computers show 'Nothing happens':
  - Check Windows Firewall on those computers
  - Verify they can access \\[SERVER]\KidsFiles share
  - Try running Install.bat manually on those computers

"@ -Color Yellow

#endregion
