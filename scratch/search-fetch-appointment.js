const fs = require('fs');
const code = fs.readFileSync('src/components/ui/appointment-modal.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('appointments') && (line.includes('select') || line.includes('update') || line.includes('insert'))) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
