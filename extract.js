const fs = require('fs');

const stepIndices = [99, 155, 294, 350, 356, 375, 456, 462, 468, 519, 534];

for (let idx of stepIndices) {
  const filePath = `e:\\Code\\CrunchyVerse\\step_${idx}_dump.json`;
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (fileContent.includes('connectDiscordRPC') || fileContent.includes('rpcSocket')) {
      console.log(`FOUND RPC stuff in ${filePath}!`);
    }
  }
}
