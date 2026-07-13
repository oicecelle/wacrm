const fs = require('fs');
const readline = require('readline');
const path = require('path');

const transcriptPath = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\7da22878-e018-4ad3-831f-37fac5f04dbb\\.system_generated\\logs\\transcript.jsonl';

async function run() {
  if (!fs.existsSync(transcriptPath)) {
    console.log("Transcript nao encontrado");
    return;
  }

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      const contentStr = JSON.stringify(obj);
      if (contentStr.includes('media__') && obj.type === 'USER_INPUT') {
        console.log(`Step ${obj.step_index}:`);
        console.log(`  Content: ${obj.content}`);
        console.log('');
      }
    } catch (e) {}
  }
}

run().catch(console.error);
