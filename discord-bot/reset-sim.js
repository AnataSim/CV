const fs = require('fs');
const path = require('path');

const userId = "sim-discord-661135501226672129";

async function resetSimProgress() {
  console.log(`🔄 [Reset] Memulai reset lokal untuk user: ${userId}`);

  const SUBMISSIONS_FILE = path.join(__dirname, 'database/submissions.json');
  const DECKS_FILE = path.join(__dirname, 'database/user_decks.json');
  const USERS_FILE = path.join(__dirname, 'database/users.json');

  // Local submissions
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const subs = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
      const filteredSubs = subs.filter(s => s.userId !== userId);
      fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(filteredSubs, null, 2), 'utf8');
      console.log(`✅ [Reset] Berhasil menghapus submissions lokal. Sisa data: ${filteredSubs.length}`);
    }
  } catch (e) {
    console.error("Gagal update submissions.json:", e.message);
  }

  // Local user decks
  try {
    if (fs.existsSync(DECKS_FILE)) {
      const decks = JSON.parse(fs.readFileSync(DECKS_FILE, 'utf8'));
      if (decks[userId]) {
        delete decks[userId];
        fs.writeFileSync(DECKS_FILE, JSON.stringify(decks, null, 2), 'utf8');
        console.log("✅ [Reset] Deck lokal berhasil dihapus.");
      }
    }
  } catch (e) {
    console.error("Gagal update user_decks.json:", e.message);
  }

  // Local user points
  try {
    if (fs.existsSync(USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (users[userId]) {
        users[userId].cv = 0;
        users[userId].points = 0;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
        console.log("✅ [Reset] Point/CV lokal berhasil di-reset ke 0.");
      }
    }
  } catch (e) {
    console.error("Gagal update users.json:", e.message);
  }

  console.log("🎉 [Reset] Proses reset lokal sukses!");
}

resetSimProgress();
