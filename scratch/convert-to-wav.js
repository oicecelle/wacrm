const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092';
const files = [
  'uploaded_media_1783835151969.img'
];

const ffmpegPath = path.join(__dirname, 'ffmpeg.exe');

console.log("=== CONVERTING WEBM TO WAV ===");
files.forEach((file, index) => {
  const srcPath = path.join(dir, file);
  const destPath = path.join(__dirname, `audio_new_2.wav`);
  
  try {
    console.log(`Converting ${file} -> audio_new_${index}.wav...`);
    execSync(`"${ffmpegPath}" -y -i "${srcPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${destPath}"`);
    console.log(`Success! File saved at: ${destPath}`);
  } catch (err) {
    console.error(`Error converting ${file}:`, err.message);
  }
});
