const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092';
const files = fs.readdirSync(dir).filter(f => f.startsWith('uploaded_media_'));

console.log("=== DETECTING MAGIC BYTES ===");
files.forEach(file => {
  const filePath = path.join(dir, file);
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);

  const hex = buffer.toString('hex').toUpperCase();
  let type = 'unknown';

  if (hex.startsWith('89504E470D0A1A0A')) type = 'PNG';
  else if (hex.startsWith('FFD8FF')) type = 'JPEG';
  else if (hex.startsWith('47494638')) type = 'GIF';
  else if (hex.startsWith('52494646') && hex.slice(16, 24) === '57415645') type = 'WAV (RIFF WAVE)';
  else if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') type = 'WEBP (RIFF WEBP)';
  else if (hex.startsWith('1A45DFA3')) type = 'WEBM / MKV';
  else if (hex.startsWith('494433') || hex.startsWith('FFF3') || hex.startsWith('FFF2') || hex.startsWith('FFE3')) type = 'MP3';
  else if (hex.slice(8, 16) === '66747970') type = 'MP4 / M4A (ftyp)';
  else if (hex.startsWith('4F676753')) type = 'OGG';

  console.log(` - File: ${file} | Hex: ${hex} | Detected: ${type}`);
});
