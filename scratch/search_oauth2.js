const fs = require('fs');
const path = require('path');

const files = ["rpc_code.txt", "debug_rpc_search.txt"];
const kw = "app.get('/api/oauth/link'";

files.forEach(fn => {
    const filePath = path.join("e:/Code/CrunchyVerse", fn);
    if (fs.existsSync(filePath)) {
        console.log(`Searching in ${filePath}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        let pos = content.indexOf(kw);
        if (pos !== -1) {
            console.log(`Found '${kw}' at pos ${pos}. Extracting 4000 characters...`);
            console.log(`-`.repeat(50));
            console.log(content.substring(pos, pos + 4000));
            console.log(`-`.repeat(50));
        }
    }
});
