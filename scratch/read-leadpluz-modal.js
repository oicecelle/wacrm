const fs = require('fs');
const leadPluzPath = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\lead-pluz\\web\\src\\components\\ui\\appointment-modal.tsx';
const code = fs.readFileSync(leadPluzPath, 'utf8');

const lines = code.split('\n');
let start = -1;
let end = -1;

lines.forEach((line, i) => {
  if (line.includes('const renderFormContent') || line.includes('function renderFormContent')) {
    start = i;
  }
  if (start !== -1 && end === -1 && i > start && line.includes('return (') && line.trim().startsWith('return')) {
    // let's trace matching brackets
  }
});

// Just print lines 1300 to 1450 of LeadPluz appointment-modal
console.log("=== LEADPLUZ APPOINTMENT-MODAL LINES 1300-1450 ===");
console.log(lines.slice(1300, 1450).join('\n'));
