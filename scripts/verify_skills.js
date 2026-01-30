
/**
 * Verification Script for Skill-Based Routing
 * Run with: node verify_skills.js
 */

const mockProviders = [
    { id: 'p1', name: 'Alice', skills: ['HC'] }, // Haircut only
    { id: 'p2', name: 'Bob', skills: ['HC', 'COL'] }, // Haircut + Color
    { id: 'p3', name: 'Charlie', skills: [] } // No tags (Generalist? Or unskilled?)
];

const mockAppointments = [
    { id: 'a1', service: 'Mens Cut', required_skills: ['HC'] },
    { id: 'a2', service: 'Full Color', required_skills: ['COL'] },
    { id: 'a3', service: 'Complex Cut & Color', required_skills: ['HC', 'COL'] },
    { id: 'a4', service: 'Basic Wash', required_skills: [] } // No requirement
];

function checkMatch(provider, appointment) {
    const required = appointment.required_skills;
    if (!required || required.length === 0) return true; // No skills needed

    const has = provider.skills || [];
    return required.every(r => has.includes(r));
}

console.log('--- Skill Based Routing Verification ---');

mockAppointments.forEach(apt => {
    console.log(`\nAppointment: ${apt.service} (Needs: ${apt.required_skills})`);
    mockProviders.forEach(p => {
        const isMatch = checkMatch(p, apt);
        const icon = isMatch ? '✅' : '❌';
        console.log(`  ${icon} ${p.name} [${p.skills}]`);
    });
});
