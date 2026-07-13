const fs = require('fs');
const path = require('path');
const filePath = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\src\\components\\ui\\appointment-modal.tsx';
const code = fs.readFileSync(filePath, 'utf8');

const lines = code.split('\n');
// Let's print lines 1800 to 1950 of WaCrm appointment-modal
console.log("=== WACRM APPOINTMENT-MODAL LINES 1800-1950 ===");
console.log(lines.slice(1800, 1950).join('\n'));
