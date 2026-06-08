const fs = require('fs');
const path = require('path');

const keywords = ["oauth/link", "oauth/callback", "clientId"];
const files = ["rpc_code.txt", "debug_rpc_search.txt", "discord-bot/index.js", "src/components/LoginModal.tsx"];

files.forEach(fn => {
    const filePath = path.join("e:/Code/CrunchyVerse", fn);
    if (fs.existsSync(filePath)) {
        console.log(`Searching in ${filePath}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        keywords.forEach(kw => {
            let pos = -1;
            let count = 0;
            while ((pos = content.indexOf(kw, pos + 1)) !== -1) {
                count++;
                console.log(`  Found '${kw}' match ${count} at pos ${pos}:`);
                const start = Math.max(0, pos - 150);
                const end = Math.min(content.length, pos + 700);
                const snippet = content.substring(start, end);
                console.log(`-`.repeat(40));
                console.log(snippet);
                console.log(`-`.repeat(40));
            }
        });
    } else {
        console.log(`File not found: ${filePath}`);
    }
});
