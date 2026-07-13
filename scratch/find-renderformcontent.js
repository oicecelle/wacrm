const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\src\\components\\ui\\appointment-modal.tsx';
const code = fs.readFileSync(filePath, 'utf8');
const lines = code.split('\n');

lines.forEach((line, i) => {
  if (line.includes('renderFormContent')) {
    console.log(`L${i+1}: ${line.trim()}`);
  }
});
