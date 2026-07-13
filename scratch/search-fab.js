const fs = require('fs');
const code = fs.readFileSync('src/app/(dashboard)/agenda/page.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('button') && (line.includes('fixed') || line.includes('bottom') || line.includes('float') || line.includes('flutuante') || line.includes('plus'))) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
