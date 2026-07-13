const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\d5a9c0cb-da66-4909-b080-ef1a8a9b3302';

try {
  const files = fs.readdirSync(brainDir);
  const details = files.map(file => {
    const fullPath = path.join(brainDir, file);
    const stat = fs.statSync(fullPath);
    return { name: file, path: fullPath, mtime: stat.mtime, size: stat.size };
  });

  // Sort by mtime descending
  details.sort((a, b) => b.mtime - a.mtime);

  console.log("=== ARQUIVOS ORDENADOS POR DATA NO BRAIN ATUAL ===");
  details.forEach(d => {
    console.log(`- ${d.name} (${d.size} bytes) - Modificado: ${d.mtime.toISOString()}`);
  });
} catch (e) {
  console.error(e);
}
