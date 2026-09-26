const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:/Users/gabriel/.gemini/antigravity-ide/brain/4bb8d533-0aa5-42b3-a17e-edaa1377ed02/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const userInputs = [];
  for await (const line of rl) {
    if (line.includes('"type":"USER_INPUT"')) {
      try {
        const obj = JSON.parse(line);
        userInputs.push(obj.content);
      } catch (e) {}
    }
  }

  console.log("Found", userInputs.length, "user inputs.");
  console.log("\n=== LAST 5 USER INPUTS ===\n");
  userInputs.slice(-5).forEach((input, i) => {
    console.log(`--- INPUT ${i + 1} ---`);
    console.log(input);
  });
}

main();
