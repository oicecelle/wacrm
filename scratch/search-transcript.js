const fs = require('fs');
const readline = require('readline');
const fileStream = fs.createReadStream('C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\de9b8e93-7c5f-4288-adde-f742ef813092\\.system_generated\\logs\\transcript.jsonl');
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

let lineNum = 0;
rl.on('line', (line) => {
  lineNum++;
  if (/rolagem|scrollbar|barra|scroll|deslizar/i.test(line)) {
    // Extract a snippet from content
    const match = line.match(/"content":"([^"]{1,200})"/);
    const snippet = match ? match[1] : line.substring(0, 150);
    console.log(`Line ${lineNum}: ${snippet}`);
  }
});
