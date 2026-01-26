async function getStudentProjectsByName(studentName, forceRefresh = false) {
    try {
        console.log(`Getting projects for Name: ${studentName}`);

        // 1. Fetch all students to find the ID
        const students = await fetchStudents(false);
        const student = students.find(s =>
            (s.name && s.name.trim().toLowerCase() === studentName.trim().toLowerCase()) ||
            (s.loginName && s.loginName.trim().toLowerCase() === studentName.trim().toLowerCase())
        );

        if (!student) {
            throw new Error(`Student not found with name: ${studentName}`);
        }

        console.log(`Resolved Name "${studentName}" to ID "${student.id}"`);

        // 2. Reuse existing function with the found ID
        const result = await getStudentProjects(student.id, forceRefresh);

        // 3. Add studentName to result for UI consistency
        result.studentName = student.name;

        return result;

    } catch (error) {
        console.error(`Error resolving project by name ${studentName}:`, error);
        throw error;
    }
}
