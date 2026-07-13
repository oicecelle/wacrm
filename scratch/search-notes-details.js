const fs = require('fs');
const code = fs.readFileSync('src/components/ui/appointment-modal.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('id="notes"') || line.includes('id="status"') || line.includes('renderNotes')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
