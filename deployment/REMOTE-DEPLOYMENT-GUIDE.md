# PowerShell Remote Deployment Guide

## Quick Start - Deploy to All 100+ Laptops at Once

### Prerequisites

Before running the deployment:

1. **All target laptops must be:**
   - Powered ON
   - Connected to the same network as your server
   - Windows 10/11 (with PowerShell 5.1 or higher)

2. **You need:**
   - Administrator credentials that work on all laptops
   - List of computer names or IP addresses

3. **Enable PowerShell Remoting on target computers** (see below if not enabled)

---

## Step-by-Step Deployment

### Step 1: Prepare Computer List

1. Open `computers-SAMPLE.txt`
2. Add all your laptop names or IP addresses (one per line)
3. Save as `computers.txt` in the `deployment` folder

**Example computers.txt:**
```
CLASSROOM-PC-01
CLASSROOM-PC-02
192.168.1.100
192.168.1.101
... (add all 100 computers)
```

**Quick way to get computer names on your network:**
```powershell
# Run this on your server to scan network:
1..254 | ForEach-Object {
    $ip = "192.168.1.$_"
    if (Test-Connection -ComputerName $ip -Count 1 -Quiet) {
        try {
            [System.Net.Dns]::GetHostByAddress($ip).HostName
        } catch {
            $ip
        }
    }
}
```

### Step 2: Test PowerShell Remoting (IMPORTANT!)

Before deploying, test if remoting works on a few computers:

```powershell
# Test one computer:
Test-WSMan -ComputerName CLASSROOM-PC-01

# Or:
Invoke-Command -ComputerName CLASSROOM-PC-01 -ScriptBlock { $env:COMPUTERNAME }
```

**If you get an error**, PowerShell remoting needs to be enabled (see troubleshooting below).

### Step 3: Run the Deployment

1. **Open PowerShell as Administrator** on your server
2. Navigate to deployment folder:
   ```powershell
   cd "C:\Users\[YourUsername]\OneDrive\SHARED\SOFTWARE\LTB Class Web App\deployment"
   ```
3. Run the deployment script:
   ```powershell
   .\Deploy-ProtocolHandlers.ps1
   ```
4. **Enter admin credentials** when prompted (must have admin rights on target computers)
5. Press **Y** to confirm deployment
6. **Wait** - it will deploy to all computers (takes ~30 seconds per computer)

### Step 4: Review Results

The script will show:
- ✓ Successful installations (green)
- ✗ Failed installations (red)
- Summary at the end
- Detailed CSV report saved to `deployment-results-[timestamp].csv`

---

## Troubleshooting

### Problem: "WinRM not accessible" or "Access Denied"

**Solution: Enable PowerShell Remoting on target computers**

You have several options:

#### Option A: Enable via Group Policy (if you have a domain)
1. Open Group Policy Management Console
2. Create new GPO: "Enable PSRemoting"
3. Navigate to: Computer Configuration → Policies → Windows Settings → Scripts → Startup
4. Add script:
   ```powershell
   Enable-PSRemoting -Force
   ```
5. Link GPO to computer OU
6. Wait for Group Policy update or run `gpupdate /force` on clients

#### Option B: Enable manually on each computer (first time only)
On each laptop, run PowerShell as Administrator:
```powershell
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
Restart-Service WinRM
```

#### Option C: Enable remotely using PsExec (requires physical access to download tool)
1. Download PsTools from Microsoft: https://docs.microsoft.com/en-us/sysinternals/downloads/psexec
2. Extract to C:\Tools\
3. Run from server:
   ```cmd
   psexec \\CLASSROOM-PC-01 -s powershell Enable-PSRemoting -Force
   ```

#### Option D: Use Windows Firewall to allow WinRM
If computers have firewall blocking WinRM:
```powershell
# Run on each target computer:
Enable-PSRemoting -SkipNetworkProfileCheck -Force
Set-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -RemoteAddress Any
```

### Problem: "Cannot reach computer"

**Possible causes:**
1. Computer is off or sleeping → Wake it up or turn on
2. Not on same network → Check network connection
3. Firewall blocking ping → Try using IP address instead of name
4. Wrong computer name/IP → Verify in computers.txt

### Problem: "Access Denied"

**Solutions:**
1. Make sure the credentials you entered have **Administrator rights** on target computers
2. If computers are in workgroup (not domain):
   - On target computers, add your admin account to Administrators group
   - Or use the local Administrator account
3. Check User Account Control (UAC) settings

### Problem: Deployment succeeds but files don't open

**Check these:**
1. Run `Install.bat` manually on one failed computer to see specific error
2. Verify file share is accessible: Try opening `\\[SERVER-NAME]\KidsFiles` from that computer
3. Check if batch files were copied: Look in `C:\LearnToBot\` on target computer
4. Verify registry entries: Open Registry Editor, check `HKEY_CLASSES_ROOT\studentfolder`

---

## Advanced Usage

### Deploy to specific computers only

```powershell
# Deploy to just 3 computers:
.\Deploy-ProtocolHandlers.ps1 -ComputerNames "PC-01","PC-02","PC-03"
```

### Use different credentials per computer group

```powershell
# Lab 1 computers (with Lab1 admin credentials):
$cred1 = Get-Credential
.\Deploy-ProtocolHandlers.ps1 -ComputerNames "LAB1-PC-01","LAB1-PC-02" -Credential $cred1

# Lab 2 computers (with Lab2 admin credentials):
$cred2 = Get-Credential
.\Deploy-ProtocolHandlers.ps1 -ComputerNames "LAB2-PC-01","LAB2-PC-02" -Credential $cred2
```

### Re-deploy to only failed computers

After first deployment:
1. Open the CSV results file
2. Copy computer names where Status = "Failed"
3. Create new `failed-computers.txt` with those names
4. Run:
   ```powershell
   .\Deploy-ProtocolHandlers.ps1
   ```
   (It will read from computers.txt, so rename failed-computers.txt to computers.txt first)

---

## What Gets Installed

On each target computer, the script:
1. Creates `C:\LearnToBot\` folder
2. Copies `OpenStudentFolder.bat`
3. Copies `OpenStudentFile.bat`
4. Imports registry settings for `studentfolder://` and `studentfile://` protocols

**Total size:** ~5 KB per computer

---

## Testing After Deployment

On any deployed computer:
1. Open browser
2. Go to: `http://[SERVER-IP]:3000/student-files.html`
3. Click green **"Open in Explorer"** button on any folder
4. **Windows Explorer should open** showing that folder
5. Click **"View Files"** on a folder
6. Click any file
7. **File should open** with its default program

If it works, deployment was successful!

---

## Security Notes

- The deployment uses PowerShell remoting (encrypted by default)
- Only administrators can run the deployment
- Protocol handlers only access files within the shared `KidsFiles` folder
- No backdoors or remote access tools are installed

---

## Performance

- **Typical deployment time:** ~30 seconds per computer
- **100 computers:** ~50 minutes total
- **Network bandwidth:** Minimal (only ~5 KB per computer)

You can speed this up by:
1. Running multiple deployments in parallel to different subnets
2. Using PowerShell jobs to deploy to multiple computers simultaneously

---

## Alternative: If PowerShell Remoting Won't Work

If you absolutely cannot get PowerShell remoting working:

**Plan B - Shared Folder Deployment:**
1. Put `Install.bat` on a network share accessible to all computers
2. Create a login script that runs: `\\server\share\Install.bat`
3. All computers will install on next login

**Plan C - Keep Copy-Paste Method:**
- No installation needed
- Students just click "Open in Explorer" and paste the path
- Works immediately on all 100 laptops

---

## Getting Help

**Test the script on 2-3 computers first before deploying to all 100!**

If you encounter issues:
1. Check the CSV results file for specific error messages
2. Test manually on a failed computer with `Install.bat`
3. Verify network connectivity and credentials
4. Check Windows Event Viewer on failed computers for errors

For common errors, see the Troubleshooting section above.
