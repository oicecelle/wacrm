const fs = require('fs');
const code = fs.readFileSync('src/app/(dashboard)/agenda/page.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('appointments.filter') || line.includes('renderAppointments') || line.includes('map(')) {
    if (line.includes('appt') || line.includes('appointment')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  }
});
