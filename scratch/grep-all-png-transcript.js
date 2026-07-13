const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\7da22878-e018-4ad3-831f-37fac5f04dbb\\.system_generated\\logs\\transcript.jsonl';

async function run() {
  if (!fs.existsSync(transcriptPath)) return;
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('.png') && line.includes('brain')) {
      const obj = JSON.parse(line);
      console.log(`Step ${obj.step_index} (${obj.type}):`);
      console.log(line.substring(0, 500));
      console.log('');
    }
  }
}
run().catch(console.error);
