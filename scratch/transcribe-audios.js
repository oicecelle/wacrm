const fs = require('fs');
const path = require('path');

const apiKey = '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';

const dir = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092';
const files = [
  'uploaded_media_0_1783811273116.img',
  'uploaded_media_1_1783811273116.img',
  'uploaded_media_2_1783811273116.img',
  'uploaded_media_3_1783811273116.img',
  'uploaded_media_4_1783811273116.img'
];

async function transcribe(fileName) {
  const filePath = path.join(dir, fileName);
  const fileBuffer = fs.readFileSync(filePath);
  
  // Create a Blob from the file buffer
  const fileBlob = new Blob([fileBuffer], { type: 'audio/webm' });
  
  const formData = new FormData();
  formData.append('file', fileBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt'); // Portuguese

  console.log(`Transcribing ${fileName}...`);
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to transcribe ${fileName}: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  return result.text;
}

async function run() {
  for (const file of files) {
    try {
      const text = await transcribe(file);
      console.log(`\n=== TRANSCRIPTION FOR ${file} ===`);
      console.log(text);
      console.log('=================================\n');
    } catch (err) {
      console.error(`Error transcribing ${file}:`, err.message);
    }
  }
}

run().catch(console.error);
