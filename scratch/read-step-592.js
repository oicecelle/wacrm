const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":592')) {
      const data = JSON.parse(line);
      console.log("=== FULL CONTENT ===");
      console.log(data.content);
      console.log("=== METADATA ===");
      console.log(JSON.stringify(data.metadata || data.additional_metadata || {}, null, 2));
      break;
    }
  }
}

extract().catch(console.error);
