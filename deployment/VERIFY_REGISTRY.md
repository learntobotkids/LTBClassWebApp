# How to Verify the Protocol is Registered

Follow these steps on the **Client Laptop** to confirm the `studentfolder://` protocol is set up correctly.

## Method 1: The "Run" Command (Fastest)

1.  Press `Windows Key + R` on your keyboard.
2.  Type `reg query HKEY_CLASSES_ROOT\studentfolder` and press Enter.
    *   **Success:** A black window flashes and closes (or shows text).
    *   **Failure:** It says "Error: The system was unable to find the specified registry key or value".

## Method 2: Registry Editor (Visual Check)

1.  Press `Windows Key + R`.
2.  Type `regedit` and press Enter. (Click "Yes" if asked for permission).
3.  In the address bar at the top, paste this and press Enter:
    `Computer\HKEY_CLASSES_ROOT\studentfolder\shell\open\command`
4.  Look at the **(Default)** value on the right side.
    *   **Correct:** `"C:\LearnToBot\OpenStudentFolder.bat" "%1"`
    *   **Incorrect:** (Value not set) or pointing to a different location.

## Method 3: Check the Files

1.  Open File Explorer.
2.  Go to `C:\LearnToBot`.
3.  Make sure you see:
    *   `OpenStudentFolder.bat`
    *   `OpenStudentFile.bat` (optional)

If any of these are missing or incorrect, please repeat the **Manual Creation** steps I provided earlier.
