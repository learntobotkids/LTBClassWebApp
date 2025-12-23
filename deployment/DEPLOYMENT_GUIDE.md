# LearnToBot Mass Deployment Guide

This guide explains how to rapidly install the protocol handlers on multiple student laptops.

## Prerequisites
1.  **Teacher Laptop**: Must be turned on and connected to the network.
2.  **Network Share**: The `SHARED` folder must be accessible from student laptops.
3.  **Administrator Access**: You need the Admin password for the student laptops.

## Method 1: The Network Run (Fastest)

This method allows you to run the installer directly from the teacher's laptop. The script is smart enough to handle network permissions automatically.

1.  **On the Student Laptop**, press `Windows + R`.
2.  Type `\\<TeacherLaptopName>\SHARED` and hit Enter.
3.  Navigate to the `SOFTWARE\LTB Class Web App\deployment` folder.
4.  **Double-click `MassInstall.bat`**.
5.  Click **YES** when asked for Administrator permission.
6.  **Done!** The window will close automatically.

## Method 2: USB Drive (Offline Backup)

If the network is slow or laptops can't find the teacher laptop yet.

1.  Copy the entire `deployment` folder to a USB drive.
2.  Plug USB into Student Laptop.
3.  Open the folder on the USB.
4.  Right-click `MassInstall.bat` and select **Run as Administrator**.
5.  **Done!**

## Verification (Optional)

To verify it worked without running the full web app:
1.  Open the student's browser.
2.  Type `studentfolder://localhost/Test` in the address bar.
3.  It should prompt to open "Student Folder Protocol" or launch Explorer immediately.

## Troubleshooting

*   **Window stays open saying "ERROR: ADMIN PRIVILEGES REQUIRED"**:
    You forgot to right-click and "Run as Administrator".
*   **"System cannot find the file specified"**:
    Ensure `OpenStudentFolder.bat`, `OpenStudentFile.bat`, and `RegisterProtocols.reg` are in the SAME folder as `MassInstall.bat`.
