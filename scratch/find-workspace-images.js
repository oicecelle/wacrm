const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001';

function findImages(dir, results = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        findImages(fullPath, results);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.svg', '.jpg', '.jpeg', '.ico'].includes(ext)) {
        results.push({ name: file, path: fullPath, size: stat.size });
      }
    }
  });
  return results;
}

const images = findImages(rootDir);
console.log("=== IMAGENS ENCONTRADAS NO WORKSPACE ===");
images.forEach(img => {
  console.log(`- ${img.name} (${img.size} bytes) in ${img.path.replace(rootDir, '')}`);
});
