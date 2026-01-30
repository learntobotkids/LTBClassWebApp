
// ============================================================================
// STUDENT LOGIN ENDPOINT (SAFEGUARD)
// ============================================================================
app.post('/api/login', async (req, res) => {
    try {
        const { studentName, parentEmail } = req.body;
        console.log(`[API] Login Attempt for: ${studentName} (Parent: ${parentEmail || 'N/A'})`);

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
            console.log(`[Login] Blocked Inactive User: ${studentName}`);
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
