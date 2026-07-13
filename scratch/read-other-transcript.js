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

  console.log("=== ENTRADAS DE TRANSCRIPT COM IMAGENS OU LOGO ===");
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      const contentStr = JSON.stringify(obj);
      if (contentStr.toLowerCase().includes('logo') || contentStr.toLowerCase().includes('media__')) {
        console.log(`Step ${obj.step_index} (${obj.type}):`);
        // Extract plain text content or tool calls to avoid printing too much JSON
        if (obj.content) console.log(`  Content: ${obj.content.substring(0, 300)}`);
        if (obj.tool_calls) console.log(`  Tools: ${JSON.stringify(obj.tool_calls).substring(0, 300)}`);
        console.log('');
      }
    } catch (e) {}
  }
}

run().catch(console.error);
