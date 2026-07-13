const fs = require('fs');
const path = require('path');
const dir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092';
const files = fs.readdirSync(dir);
const audioFiles = files.filter(f => f.includes('uploaded_media') || f.endsWith('.wav'));
console.log('ALL AUDIO FILES:', audioFiles);
