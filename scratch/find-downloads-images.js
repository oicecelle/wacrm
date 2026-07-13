const fs = require('fs');
const path = require('path');

const downloadsDir = 'C:\\Users\\SenetUser\\Downloads';

try {
  const files = fs.readdirSync(downloadsDir);
  console.log("=== ARQUIVOS DE IMAGEM EM DOWNLOADS ===");
  files.forEach(file => {
    const fullPath = path.join(downloadsDir, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.svg', '.jpg', '.jpeg', '.ico', '.webp'].includes(ext)) {
        console.log(`- ${file} (${stat.size} bytes)`);
      }
    }
  });
} catch (e) {
  console.error(e);
}
