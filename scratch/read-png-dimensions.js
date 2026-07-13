const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\d5a9c0cb-da66-4909-b080-ef1a8a9b3302';

try {
  const files = fs.readdirSync(brainDir);
  console.log("=== HEADERS DOS ARQUIVOS .IMG DO BRAIN ATUAL ===");
  files.forEach(file => {
    const fullPath = path.join(brainDir, file);
    if (path.extname(file).toLowerCase() === '.img') {
      const buffer = fs.readFileSync(fullPath);
      console.log(`- ${file}: ${buffer.slice(0, 8).toString('hex').toUpperCase()}`);
    }
  });
} catch (e) {
  console.error(e);
}
