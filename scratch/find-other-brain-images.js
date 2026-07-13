const fs = require('fs');
const path = require('path');

const otherBrainDir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\7da22878-e018-4ad3-831f-37fac5f04dbb';

try {
  if (fs.existsSync(otherBrainDir)) {
    const files = fs.readdirSync(otherBrainDir);
    console.log("=== IMAGENS NA OUTRA CONVERSA ===");
    files.forEach(file => {
      const fullPath = path.join(otherBrainDir, file);
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
