const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\d5a9c0cb-da66-4909-b080-ef1a8a9b3302';

try {
  if (fs.existsSync(brainDir)) {
    const files = fs.readdirSync(brainDir);
    console.log("=== IMAGENS NA CONVERSA ATUAL ===");
    files.forEach(file => {
      const fullPath = path.join(brainDir, file);
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        const ext = path.extname(file).toLowerCase();
        if (['.png', '.svg', '.jpg', '.jpeg', '.ico', '.webp'].includes(ext)) {
          console.log(`- ${file} (${stat.size} bytes)`);
        }
      }
    });
  } else {
    console.log("Diretorio nao existe");
  }
} catch (e) {
  console.error(e);
}
