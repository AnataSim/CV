const state = require('./state');

const RANK_ROLE_IDS = {
  leveling: '1511318299730903170',
  streak: '1511318492664561755',
  voice: '1511319103938232431',
  cvWealth: '1511319284616265798',
};

const RANK_AUTO_CHECK_INTERVAL_MS = parseInt(process.env.RANK_AUTO_CHECK_INTERVAL_MS || '600000', 10);

let lastTop1Snapshot = {
  leveling: null,
  streak: null,
  voice: null,
  cvWealth: null,
};

function getTop1Key(category, top1) {
  if (!top1) return null;
  const userIdent = top1.username || top1.displayName || top1.id;
  switch (category) {
    case 'leveling': return `${userIdent}|${top1.level}`;
    case 'streak': return `${userIdent}|${top1.streak}`;
    case 'voice': return `${userIdent}|${top1.hours}`;
    case 'cvWealth': return `${userIdent}|${top1.cvAmount}`;
    default: return null;
  }
}

function buildRoleName(category, top1) {
  switch (category) {
    case 'leveling': return `🏆 Rank 1 Leveling: Level ${top1.level}`;
    case 'streak': return `🏆 Rank 1 Streak: ☀️ ${top1.streak} Hari`;
    case 'voice': return `🏆 Rank 1 Voice: ${top1.hours} Hours`;
    case 'cvWealth': return `🏆 Rank 1 Value Account: CV$ ${top1.cvAmount}`;
    default: return null;
  }
}

async function executeRankRoleUpdate({ silent = false, changedOnly = false } = {}) {
  const GUILD_ID = process.env.GUILD_ID;
  if (!state.isDiscordReady || !state.client || !GUILD_ID) {
    return { success: false, message: 'Bot Discord tidak aktif.', results: [] };
  }

  let leaderboard = null;
  try {
    const port = process.env.PORT || 3001;
    const lbRes = await fetch(`http://localhost:${port}/api/leaderboard`, {
      signal: AbortSignal.timeout(15000)
    });
    if (!lbRes.ok) throw new Error(`HTTP ${lbRes.status}`);
    leaderboard = await lbRes.json();
  } catch (err) {
    return { success: false, message: `Gagal fetch leaderboard: ${err.message}`, results: [] };
  }

  const guild = await state.client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return { success: false, message: `Guild ${GUILD_ID} tidak ditemukan.`, results: [] };

  let membersCache;
  try {
    membersCache = await guild.members.fetch();
  } catch (err) {
    membersCache = guild.members.cache;
  }

  function findMember(top1) {
    const id = top1.id;
    const username = top1.username || top1.displayName || '';
    if (/^\d{17,20}$/.test(id)) {
      const byId = membersCache.get(id);
      if (byId) return byId;
    }
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
    return membersCache.find(m =>
      m.user.username.toLowerCase() === cleanUsername ||
      m.user.username.toLowerCase().includes(cleanUsername) ||
      m.displayName.toLowerCase().includes(cleanUsername)
    ) || null;
  }

  const categories = ['leveling', 'streak', 'voice', 'cvWealth'];
  const results = [];
  let anyChanged = false;

  for (const cat of categories) {
    const list = leaderboard[cat];
    const roleId = RANK_ROLE_IDS[cat];

    if (!list || list.length === 0) {
      results.push({ category: cat, success: false, reason: 'Data kosong' });
      continue;
    }

    const top1 = list.find(e => e.rank === 1) || list[0];
    const currentKey = getTop1Key(cat, top1);
    const prevKey = lastTop1Snapshot[cat];

    const hasChanged = currentKey !== prevKey;
    if (changedOnly && !hasChanged) {
      if (!silent) console.log(`ℹ️ [AutoRank] ${cat}: tidak ada perubahan (${currentKey}), dilewati.`);
      results.push({ category: cat, success: true, skipped: true, reason: 'Tidak ada perubahan' });
      continue;
    }

    if (hasChanged) {
      anyChanged = true;
      console.log(`🔔 [AutoRank] Perubahan terdeteksi di "${cat}": ${prevKey || 'pertama kali'} → ${currentKey}`);
    }

    const newName = buildRoleName(cat, top1);
    if (!newName) {
      results.push({ category: cat, success: false, reason: 'Format nama tidak dikenali' });
      continue;
    }

    try {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        results.push({ category: cat, success: false, reason: `Role ${roleId} tidak ditemukan`, champion: top1.displayName });
        continue;
      }
      if (role.name !== newName) {
        await role.setName(newName, 'Auto-update CrunchyVerse Rank Watcher');
        console.log(`✅ [AutoRank] Role "${cat}": "${role.name}" → "${newName}"`);
      }

      const currentHolders = membersCache.filter(m => m.roles.cache.has(roleId));
      for (const [, holder] of currentHolders) {
        await holder.roles.remove(roleId, 'Revoke - bukan rank 1 lagi').catch(() => { });
        console.log(`🔴 [AutoRank] Melepas role dari ${holder.user.username}`);
        await new Promise(r => setTimeout(r, 500));
      }

      const champion = findMember(top1);
      let assignedTo = null;
      if (champion) {
        await champion.roles.add(roleId, `Rank #1 ${cat} auto-assign`).catch(() => { });
        console.log(`🏆 [AutoRank] Role "${newName}" → ${champion.user.username} (${champion.id})`);
        assignedTo = champion.displayName;
      } else {
        console.warn(`⚠️ [AutoRank] Member "${top1.displayName}" (ID: ${top1.id}) tidak ditemukan di guild.`);
      }

      lastTop1Snapshot[cat] = currentKey;

      results.push({
        category: cat, success: true, newName,
        champion: top1.displayName, assignedTo,
        memberFound: !!champion, changed: hasChanged,
        prevHoldersRevoked: currentHolders.size
      });

      await new Promise(r => setTimeout(r, 1500));

    } catch (err) {
      console.error(`❌ [AutoRank] Gagal proses "${cat}": ${err.message}`);
      results.push({ category: cat, success: false, reason: err.message, champion: top1?.displayName });
    }
  }

  const successCount = results.filter(r => r.success && !r.skipped).length;
  const assignedCount = results.filter(r => r.assignedTo).length;
  return {
    success: successCount > 0 || !anyChanged,
    message: anyChanged
      ? `${successCount}/4 role diperbarui · ${assignedCount}/4 berhasil di-assign ke juara`
      : 'Tidak ada perubahan skor — semua role masih relevan ✅',
    results,
    anyChanged
  };
}

async function autoRankRoleCheck() {
  const GUILD_ID = process.env.GUILD_ID;
  if (!state.isDiscordReady || !state.client || !GUILD_ID) return;
  console.log(`\n⏰ [AutoRank] Menjalankan pengecekan otomatis rank role...`);
  try {
    const result = await executeRankRoleUpdate({ silent: true, changedOnly: true });
    if (result.anyChanged) {
      console.log(`🏆 [AutoRank] Update selesai: ${result.message}`);
    } else {
      console.log(`✅ [AutoRank] Tidak ada perubahan peringkat — role tetap relevan.`);
    }
  } catch (err) {
    console.error(`❌ [AutoRank] Error saat auto-check: ${err.message}`);
  }
}

module.exports = {
  RANK_ROLE_IDS,
  RANK_AUTO_CHECK_INTERVAL_MS,
  lastTop1Snapshot,
  getTop1Key,
  buildRoleName,
  executeRankRoleUpdate,
  autoRankRoleCheck
};
