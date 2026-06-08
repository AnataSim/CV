import re
import os

keywords = ["oauth/link", "oauth/callback", "clientId"]
files = ["rpc_code.txt", "debug_rpc_search.txt", "discord-bot/index.js", "src/components/LoginModal.tsx"]

for fn in files:
    path = os.path.join("e:/Code/CrunchyVerse", fn)
    if os.path.exists(path):
        print(f"Searching in {path}...")
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            for kw in keywords:
                matches = [m.start() for m in re.finditer(kw, content)]
                if matches:
                    print(f"  Found '{kw}' {len(matches)} times:")
                    for idx, pos in enumerate(matches):
                        start = max(0, pos - 200)
                        end = min(len(content), pos + 1000)
                        snippet = content[start:end]
                        print(f"    Match {idx + 1} at pos {pos}:\n{'-'*40}\n{snippet}\n{'-'*40}\n")
    else:
        print(f"File not found: {path}")
