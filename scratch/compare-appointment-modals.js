const fs = require('fs');

const leadPluzPath = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\lead-pluz\\web\\src\\components\\ui\\appointment-modal.tsx';
const waCrmPath = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\src\\components\\ui\\appointment-modal.tsx';

const leadPluzCode = fs.readFileSync(leadPluzPath, 'utf8');
const waCrmCode = fs.readFileSync(waCrmPath, 'utf8');

console.log("=== COMPARING APPOINTMENT MODAL SIZES ===");
console.log(`LeadPluz appointment-modal.tsx: ${leadPluzCode.length} bytes, ${leadPluzCode.split('\n').length} lines`);
console.log(`WaCrm appointment-modal.tsx: ${waCrmCode.length} bytes, ${waCrmCode.split('\n').length} lines`);

// Find tab states or lists in both
const findTabs = (code) => {
  const matches = [];
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('activeTab') || line.includes('setActiveTab') || line.includes('"prontuario"')) {
      matches.push(`L${i+1}: ${line.trim()}`);
    }
  });
  return matches.slice(0, 10);
};

console.log("\n=== LeadPluz Tabs matches ===");
console.log(findTabs(leadPluzCode).join('\n'));

console.log("\n=== WaCrm Tabs matches ===");
console.log(findTabs(waCrmCode).join('\n'));
