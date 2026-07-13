const fs = require('fs');
const code = fs.readFileSync('src/app/(dashboard)/agenda/page.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
  if (line.includes('appointments') && (line.includes('map') || line.includes('render') || line.includes('card') || line.includes('div'))) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
