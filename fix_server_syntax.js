
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const loginCode = `
// ============================================================================
// STUDENT LOGIN ENDPOINT (SAFEGUARD)
// ============================================================================
app.post('/api/login', async (req, res) => {
    try {
        const { studentName, parentEmail } = req.body;
        console.log(\`[API] Login Attempt for: \${studentName} (Parent: \${parentEmail || 'N/A'})\`);

        if (!studentName) {
            return res.status(400).json({ success: false, message: 'Student name is required' });
        }

        // Fetch all students to verify status
        const students = await googleSheetsService.fetchStudents();
        const student = students.find(s => s.name.toLowerCase() === studentName.toLowerCase() || s.loginName.toLowerCase() === studentName.toLowerCase());

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student account not found.' });
        }

        // Check Active Status
        if (student.hasOwnProperty('isActive') && !student.isActive) {
            console.log(\`[Login] Blocked Inactive User: \${studentName}\`);
            return res.status(403).json({
                success: false,
                message: 'Your subscription has ended. Please contact admin@learntobot.com or text us at +13462151556 if you think this is an error.'
            });
        }

        // (Optional) Check Parent Email if provided
        if (parentEmail && student.parentEmail && student.parentEmail.toLowerCase() !== parentEmail.toLowerCase()) {
             // Since we rely on name locally, this is a secondary check if data is available
             // But for now, we trust the name if the ID matches what we expect
        }

        res.json({ success: true, student });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Login failed due to server error.' });
    }
});
`;

try {
    let content = fs.readFileSync(serverPath, 'utf8');

    // Find the end of the last valid comment block
    // The key marker is the closing of the "END OF SERVER.JS" comment header
    const marker = ' * ============================================================================';
    const lastMarkerIndex = content.lastIndexOf(marker);

    if (lastMarkerIndex !== -1) {
        // Find the " */" after the marker
        const closingCommentIndex = content.indexOf(' */', lastMarkerIndex);

        if (closingCommentIndex !== -1) {
            // Keep everything up to " */" + 3 characters (to include them)
            const cutoff = closingCommentIndex + 3;
            const validContent = content.substring(0, cutoff);

            // Write back valid content + new code
            fs.writeFileSync(serverPath, validContent + '\n' + loginCode);
            console.log('Successfully repaired server.js and added login endpoint.');
        } else {
            console.error('Could not find closing comment tag */ after variable marker.');
        }
    } else {
        console.error('Could not find END OF SERVER.JS marker.');
    }

} catch (err) {
    console.error('Error processing file:', err);
}
