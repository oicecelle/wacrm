const fs = require('fs');
const code = fs.readFileSync('src/components/ui/appointment-modal.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('patients') && (line.includes('select') || line.includes('map') || line.includes('input') || line.includes('filter'))) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
