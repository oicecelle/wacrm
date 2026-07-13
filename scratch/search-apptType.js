const fs = require('fs');
const code = fs.readFileSync('src/components/ui/appointment-modal.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('apptType') || line.includes('setApptType')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
