const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"step_index":756') || line.includes('"step_index":755')) {
      const data = JSON.parse(line);
      console.log(`=== STEP ${data.step_index} (${data.type}) ===`);
      console.log(data.content);
      if (data.tool_calls) {
        console.log("Tool Calls:", JSON.stringify(data.tool_calls, null, 2));
      }
    }
  }
}

extract().catch(console.error);
