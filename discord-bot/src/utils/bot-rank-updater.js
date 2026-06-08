/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  bot-rank-updater.js — CrunchyVerse Rank Role Auto-Updater      ║
 * ║                                                                  ║
 * ║  Secara otomatis mengambil juara #1 di setiap kategori           ║
 * ║  leaderboard, lalu memperbarui nama role Discord mereka          ║
 * ║  dengan skor/level/streak/voice/value terbaru.                   ║
 * ║                                                                  ║
 * ║  Cara pakai:                                                     ║
 * ║    node bot-rank-updater.js                                      ║
 * ║                                                                  ║
 * ║  Variabel .env yang dibutuhkan:                                  ║
 * ║    DISCORD_TOKEN — token bot Sparxie                             ║
 * ║    GUILD_ID      — ID server Discord CrunchyVerse                ║
 * ║    BOT_API_URL   — URL API backend (default: http://localhost:3001)║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3001';

// Role ID → format nama baru yang akan dipakai
// "..." akan diganti dengan nilai juara 1 secara otomatis
const RANK_ROLES = {
  leveling: {
    roleId: '1511318299730903170',
    // Contoh hasil: "🏆 Rank 1 Leveling: Level 171"
    buildName: (top1) => `🏆 Rank 1 Leveling: Level ${top1.level}`,
  },
  streak: {
    roleId: '1511318492664561755',
    // Contoh hasil: "🏆 Rank 1 Streak: ☀️ 30 Hari"
    buildName: (top1) => `🏆 Rank 1 Streak: ☀️ ${top1.streak} Hari`,
  },
  voice: {
    roleId: '1511319103938232431',
    // Contoh hasil: "🏆 Rank 1 Voice: 420 Hours"
    buildName: (top1) => `🏆 Rank 1 Voice: ${top1.hours} Hours`,
  },
  cvWealth: {
    roleId: '1511319284616265798',
    // Contoh hasil: "🏆 Rank 1 Value Account: CV$ 12.982.500"
    buildName: (top1) => `🏆 Rank 1 Value Account: CV$ ${top1.cvAmount}`,
  },
};

// Interval update otomatis (default: setiap 1 jam = 3.600.000 ms)
const UPDATE_INTERVAL_MS = parseInt(process.env.RANK_UPDATE_INTERVAL_MS || '3600000', 10);

// ─── Discord Client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Helper: Fetch leaderboard dari backend API ────────────────────────────────

async function fetchLeaderboard() {
  const url = `${BOT_API_URL}/api/leaderboard`;
  console.log(`📡 [RankUpdater] Fetching leaderboard dari ${url}...`);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);

  const data = await res.json();
  return data; // { leveling: [], streak: [], voice: [], cvWealth: [] }
}

// ─── Helper: Update satu role Discord ─────────────────────────────────────────

async function updateRoleName(guild, roleId, newName) {
  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) {
      console.warn(`⚠️ [RankUpdater] Role ${roleId} tidak ditemukan di guild.`);
      return false;
    }

    const currentName = role.name;
    if (currentName === newName) {
      console.log(`ℹ️ [RankUpdater] Role "${currentName}" tidak perlu diubah (sudah sama).`);
      return true;
    }

    await role.setName(newName, 'Auto-update oleh Sparxie Rank Updater');
    console.log(`✅ [RankUpdater] Role diperbarui: "${currentName}" → "${newName}"`);
    return true;
  } catch (err) {
    console.error(`❌ [RankUpdater] Gagal memperbarui role ${roleId}: ${err.message}`);
    return false;
  }
}

// ─── Fungsi utama: satu siklus update ─────────────────────────────────────────

async function runUpdateCycle() {
  console.log(`\n🔄 [RankUpdater] ====== Memulai siklus update rank roles ======`);
  console.log(`🕐 Waktu: ${new Date().toLocaleString('id-ID')}`);

  // 1. Fetch data leaderboard terbaru
  let leaderboard;
  try {
    leaderboard = await fetchLeaderboard();
  } catch (err) {
    console.error(`❌ [RankUpdater] Gagal fetch leaderboard: ${err.message}`);
    console.log(`⏭️  Siklus dilewati. Mencoba lagi dalam ${UPDATE_INTERVAL_MS / 60000} menit.`);
    return;
  }

  // 2. Ambil guild
  let guild;
  try {
    guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) throw new Error('Guild tidak ditemukan');
  } catch (err) {
    console.error(`❌ [RankUpdater] Gagal mengambil guild ${GUILD_ID}: ${err.message}`);
    return;
  }

  // 3. Proses tiap kategori
  const categories = [
    { key: 'leveling', list: leaderboard.leveling },
    { key: 'streak', list: leaderboard.streak },
    { key: 'voice', list: leaderboard.voice },
    { key: 'cvWealth', list: leaderboard.cvWealth },
  ];

  let successCount = 0;

  for (const { key, list } of categories) {
    const config = RANK_ROLES[key];
    if (!config) continue;

    if (!list || list.length === 0) {
      console.warn(`⚠️ [RankUpdater] Data "${key}" kosong, melewati...`);
      continue;
    }

    // Ambil entry rank 1
    const top1 = list.find(e => e.rank === 1) || list[0];

    // Log info juara 1
    const scoreDesc =
      key === 'leveling' ? `Level ${top1.level}` :
        key === 'streak' ? `${top1.streak} Hari` :
          key === 'voice' ? `${top1.hours} Jam` :
      /* cvWealth */       `$${top1.cvAmount}`;

    console.log(`\n🏆 [${key.toUpperCase()}] Juara 1: ${top1.displayName || top1.username} (ID: ${top1.id}) — ${scoreDesc}`);

    // Bangun nama role baru
    const newRoleName = config.buildName(top1);
    console.log(`   📝 Nama role baru: "${newRoleName}"`);

    // Update role
    const ok = await updateRoleName(guild, config.roleId, newRoleName);
    if (ok) successCount++;

    // Rate-limit safety: tunggu 1.5 detik antar update role
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n✅ [RankUpdater] Siklus selesai. ${successCount}/4 role berhasil diperbarui.`);
  console.log(`⏰ Update berikutnya dalam ${UPDATE_INTERVAL_MS / 60000} menit.\n`);
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`\n🤖 [RankUpdater] Bot Sparxie Rank Updater online sebagai ${client.user.tag}`);
  console.log(`🎪 Guild target: ${GUILD_ID}`);
  console.log(`🔄 Interval update: setiap ${UPDATE_INTERVAL_MS / 60000} menit\n`);

  // Jalankan langsung sekali saat startup
  await runUpdateCycle();

  // Lalu jadwalkan secara periodik
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
});

client.on('error', (err) => {
  console.error(`❌ [RankUpdater] Discord client error: ${err.message}`);
});

// Validasi env vars sebelum login
if (!DISCORD_TOKEN || DISCORD_TOKEN === 'your_discord_bot_token_here') {
  console.error('❌ [RankUpdater] DISCORD_TOKEN belum diisi di .env!');
  console.error('   Isi DISCORD_TOKEN di discord-bot/.env lalu jalankan ulang.');
  process.exit(1);
}

if (!GUILD_ID) {
  console.error('❌ [RankUpdater] GUILD_ID belum diisi di .env!');
  process.exit(1);
}

console.log('🚀 [RankUpdater] Menghubungkan ke Discord...');
client.login(DISCORD_TOKEN).catch(err => {
  console.error(`❌ [RankUpdater] Login gagal: ${err.message}`);
  process.exit(1);
});
