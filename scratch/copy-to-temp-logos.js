const fs = require('fs');
const path = require('path');

const downloadsDir = 'C:\\Users\\SenetUser\\Downloads';
const targetDir = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\public\\temp-logos';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const files = fs.readdirSync(downloadsDir);
const copied = [];

files.forEach(file => {
  const fullPath = path.join(downloadsDir, file);
  if (!fs.statSync(fullPath).isDirectory()) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.svg', '.jpg', '.jpeg', '.ico', '.webp'].includes(ext)) {
      const destName = file.replace(/[\s,]+/g, '_'); // sanitize spaces
      const destPath = path.join(targetDir, destName);
      fs.copyFileSync(fullPath, destPath);
      copied.push(destName);
    }
  }
});

// Generate index.html
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>View Images</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f0f0f0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
    .card { background: white; padding: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    img { max-width: 100%; max-height: 200px; object-fit: contain; background: #eee; }
    h3 { font-size: 12px; word-break: break-all; margin: 10px 0 5px 0; }
  </style>
</head>
<body>
  <h2>Downloads Images list</h2>
  <div class="grid">
    ${copied.map(c => `
      <div class="card">
        <img src="/temp-logos/${c}" />
        <h3>${c}</h3>
      </div>
    `).join('\n')}
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(targetDir, 'index.html'), htmlContent);
console.log(`Copiados ${copied.length} arquivos para public/temp-logos e gerado index.html`);
