LearnToBot Protocol Handler Installation Instructions
======================================================

This will enable students to open folders and files directly from the web browser
by clicking links, which will open folders in Windows Explorer and files with their
default programs.

INSTALLATION STEPS:
===================

1. COPY FILES TO WINDOWS LAPTOP:
   - Copy the entire "deployment" folder to the Windows laptop
   - You can use a USB drive or access via OneDrive

2. RUN THE INSTALLER:
   - Navigate to the deployment folder
   - Right-click "Install.bat"
   - Select "Run as Administrator"
   - Click "Yes" when Windows asks for permission
   - Wait for "Installation Complete!" message
   - Press any key to close

3. SETUP WINDOWS FILE SHARE (One-time, on server only):
   - Right-click "FINAL KIDS FILES" folder
   - Properties → Sharing tab → Advanced Sharing
   - Check "Share this folder"
   - Share name: KidsFiles (MUST be exactly this)
   - Permissions: Grant "Read" to "Everyone" or specific users
   - Click OK

4. TEST IT WORKS:
   - Open Command Prompt
   - Type: studentfolder://test
   - Press Enter
   - Should attempt to open a folder in Explorer
   - If you get an error, the share isn't set up yet (step 3)

5. OPTIONAL: SET SERVER NAME
   - If students are on different computers than the server:
   - Open C:\LearnToBot\OpenStudentFolder.bat in Notepad
   - Find the line: set "SERVER_NAME=%COMPUTERNAME%"
   - Replace with: set "SERVER_NAME=YOUR-SERVER-NAME"
   - Save the file
   - Do the same for OpenStudentFile.bat

REPEAT FOR EACH LAPTOP:
=======================
You need to run Install.bat on EVERY student laptop that will access the system.

The file share (step 3) only needs to be done once on the server computer.

TROUBLESHOOTING:
================
- If nothing happens when clicking links, check that Install.bat was run as Administrator
- If you get "network path not found", check the file share is set up correctly
- To uninstall, delete C:\LearnToBot folder and remove registry keys manually

WHAT IT INSTALLS:
=================
- C:\LearnToBot\OpenStudentFolder.bat
- C:\LearnToBot\OpenStudentFile.bat
- Registry entries for studentfolder:// and studentfile:// protocols

For support, contact your system administrator.
