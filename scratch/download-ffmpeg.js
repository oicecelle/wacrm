const fs = require('fs');
const path = require('path');

const url = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/win32-x64';
const dest = path.join(__dirname, 'ffmpeg.exe');

async function download() {
  console.log(`Downloading ffmpeg from ${url} to ${dest}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log('Download complete!');
}

download().catch(console.error);
