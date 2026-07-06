const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let ctx = {
  client: null,
  db: null,
  cache: null,
  requireClientToken: null,
  GUILD_ID: null,
  withTimeout: null,
  loadLocalUsers: null,
  saveLocalUsers: null,
  loadLocalSubmissions: null,
  saveLocalSubmissions: null,
  loadLocalDecks: null,
  saveLocalDecks: null,
  getUserDeck: null,
  loadLocalQuests: null,
  saveLocalQuests: null,
  updatePlayerProgressRoles: null,
  isDiscordReady: () => false,
  PORT: 3001,
  decryptPayload: null,
  decodePayload: null,
  verifyIsAdmin: null,
};


const requireClientToken = (req, res, next) => {
  if (requireClientToken) {
    return requireClientToken(req, res, next);
  }
  return res.status(503).json({ error: "Authentication middleware not ready" });
};

const LINKED_ACCOUNTS_FILE = path.join(__dirname, '../../database/linked-accounts.json');

// Cache to prevent errors on duplicate/prefetch OAuth callback requests
const EXCHANGED_CODES = new Map();
const PENDING_EXCHANGES = new Map(); // code -> Promise

// Clean up expired codes from cache every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of EXCHANGED_CODES.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      EXCHANGED_CODES.delete(code);
    }
  }
}, 60000);

function loadLinkedAccounts() {
  if (!fs.existsSync(LINKED_ACCOUNTS_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(LINKED_ACCOUNTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Error reading linked-accounts.json:', err.message);
    return {};
  }
}

function saveLinkedAccounts(accounts) {
  try {
    fs.writeFileSync(LINKED_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error writing linked-accounts.json:', err.message);
  }
}

// Helper to pull user's stats from the local leaderboard endpoint
async function getUserStats(userId) {
  let level = 1;
  let voice = 0;
  let streak = 0;
  let cv_wealth = 0;

  const accounts = loadLinkedAccounts();
  const userAcc = accounts[userId];
  const username = userAcc ? userAcc.username : null;

  try {
    const lbUrl = `http://localhost:${ctx.PORT}/api/leaderboard`;
    const res = await fetch(lbUrl);
    if (res.ok) {
      const data = await res.json();

      const levelUser = data.leveling.find(u => u.id === userId || (username && u.username === username));
      if (levelUser) {
        level = levelUser.level || 1;
      }

      const streakUser = data.streak.find(u => u.id === userId || (username && u.username === username));
      if (streakUser) {
        streak = streakUser.streak || 0;
      }

      const voiceUser = data.voice.find(u => u.id === userId || (username && u.username === username));
      if (voiceUser) {
        voice = voiceUser.hours || 0;
      }

      const cvUser = data.cvWealth.find(u => u.id === userId || (username && u.username === username));
      if (cvUser) {
        const rawAmount = cvUser.cvAmount || "0";
        cv_wealth = parseInt(rawAmount.replace(/\./g, ''), 10) || 0;
      }
    }
  } catch (err) {
    console.error(`⚠️ [Stats] Gagal mengambil stats dari leaderboard lokal:`, err.message);
  }

  return { level, voice, streak, cv_wealth };
}

// Helper to push profile widget metadata to Discord (Identities API)
async function updateDiscordProfileWidget(userId, stats) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const botToken = process.env.DISCORD_TOKEN;
  
  if (!appId || !botToken) {
    console.error("❌ [Widget] DISCORD_CLIENT_ID atau DISCORD_TOKEN tidak terkonfigurasi di env.");
    return false;
  }

  const url = `https://discord.com/api/v9/applications/${appId}/users/${userId}/identities/0/profile`;
  const payload = {
    data: {
      dynamic: [
        {
          type: 2,
          name: "level", // Sesuai Data Field Key di Developer Portal
          value: stats.level
        },
        {
          type: 2,
          name: "voice",
          value: stats.voice
        },
        {
          type: 2,
          name: "streak",
          value: stats.streak
        },
        {
          type: 2,
          name: "cv_wealth",
          value: stats.cv_wealth
        }
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordBot (CrunchyVerse Widget Sync, 1.0.0)'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✅ [Widget] Successfully updated profile widget for user ${userId}`);
      return true;
    } else {
      const errText = await response.text();
      console.error(`❌ [Widget] Failed to update profile widget:`, errText);
      return false;
    }
  } catch (err) {
    console.error(`❌ [Widget] Error updating profile widget:`, err.message);
    return false;
  }
}

// Helper to install/add the widget to the user's Board profile
async function installUserProfileWidget(userId, accessToken) {
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!appId) {
    console.error("❌ [Widget] DISCORD_CLIENT_ID tidak terkonfigurasi di env.");
    return { success: false, error: "DISCORD_CLIENT_ID env missing" };
  }

  const url = `https://discord.com/api/v9/users/@me/widgets`;
  const payload = {
    widgets: [
      {
        data: {
          type: "application",
          application_id: appId
        }
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✅ [Widget] Successfully installed profile widget for user ID: ${userId}`);
      return { success: true };
    } else {
      const errText = await response.text();
      console.error(`❌ [Widget] Failed to install profile widget:`, errText);
      return { success: false, error: errText };
    }
  } catch (err) {
    console.error(`❌ [Widget] Error installing profile widget:`, err.message);
    return { success: false, error: err.message };
  }
}

// Helper to push connection metadata to Discord
async function updateConnectionMetadata(userId, username, accessToken) {
  console.log(`📡 [OAuth] Updating connection metadata for @${username} (ID: ${userId})...`);

  const stats = await getUserStats(userId);
  console.log(`📊 [OAuth] User Stats:`, stats);

  // Sync profile widget dynamically
  await updateDiscordProfileWidget(userId, stats);

  const url = `https://discord.com/api/v10/users/@me/applications/${process.env.DISCORD_CLIENT_ID}/role-connection`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platform_name: "CrunchyVerse",
        platform_username: username,
        metadata: {
          level: stats.level,
          voice: stats.voice,
          streak: stats.streak,
          cv_wealth: stats.cv_wealth
        }
      })
    });

    if (response.ok) {
      console.log(`✅ [OAuth] Successfully pushed stats to Discord for @${username}`);
      return true;
    } else {
      const errText = await response.text();
      console.error(`❌ [OAuth] Failed to push stats to Discord:`, errText);
      return false;
    }
  } catch (err) {
    console.error(`❌ [OAuth] Error pushing stats to Discord:`, err.message);
    return false;
  }
}

// Helper to refresh expired OAuth2 access tokens
async function refreshAccessToken(userId, refreshToken) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  try {
    console.log(`📡 [OAuth] Refreshing access token for user ID: ${userId}...`);
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${await response.text()}`);
    }

    const tokens = await response.json();
    const accounts = loadLinkedAccounts();

    if (accounts[userId]) {
      accounts[userId].access_token = tokens.access_token;
      accounts[userId].refresh_token = tokens.refresh_token;
      accounts[userId].expires_at = Date.now() + (tokens.expires_in * 1000);
      saveLinkedAccounts(accounts);
      console.log(`✅ [OAuth] Access token successfully refreshed for user ID: ${userId}`);
      return tokens.access_token;
    }
  } catch (err) {
    console.error(`❌ [OAuth] Failed to refresh token for user ID ${userId}:`, err.message);
  }
  return null;
}

// Background sync job to keep stats fresh
async function runMetadataSyncCycle() {
  console.log(`\n🔄 [OAuth] ====== Memulai sinkronisasi metadata Discord ======`);
  const accounts = loadLinkedAccounts();
  const userIds = Object.keys(accounts);

  if (userIds.length === 0) {
    console.log(`ℹ️ [OAuth] Tidak ada akun yang terhubung untuk disinkronisasi.`);
    return;
  }

  console.log(`👥 [OAuth] Mensinkronisasi ${userIds.length} akun...`);

  for (const userId of userIds) {
    const acc = accounts[userId];
    let token = acc.access_token;

    if (Date.now() > (acc.expires_at - 300000)) {
      token = await refreshAccessToken(userId, acc.refresh_token);
    }

    if (token) {
      await updateConnectionMetadata(userId, acc.username, token);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`✅ [OAuth] Sinkronisasi selesai.\n`);
}

// ==========================================
// Express API Endpoints for OAuth & Quests
// ==========================================

router.get('/api/oauth/link', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20role_connections.write%20sdk.social_layer_presence`;
  res.redirect(url);
});

router.get('/api/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Missing OAuth2 auth code.");
  }

  if (EXCHANGED_CODES.has(code)) {
    const cachedData = EXCHANGED_CODES.get(code);
    return res.send(`
      <html>
        <body style="background:#0a0a0a; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2 style="color:#57F287;">Koneksi Berhasil! (Cached)</h2>
          <p>Akun Discord @${cachedData.username} telah terhubung dengan kasta stage teater.</p>
          <p style="color:gray; font-size:12px;">Anda dapat menutup jendela ini dan kembali ke teater.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  }

  if (PENDING_EXCHANGES.has(code)) {
    try {
      const result = await PENDING_EXCHANGES.get(code);
      return res.send(`
        <html>
          <body style="background:#0a0a0a; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
            <h2 style="color:#57F287;">Koneksi Berhasil!</h2>
            <p>Akun Discord @${result.username} telah terhubung dengan kasta stage teater.</p>
            <p style="color:gray; font-size:12px;">Anda dapat menutup jendela ini dan kembali ke teater.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send("OAuth2 exchange failed: " + err.message);
    }
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  const exchangePromise = (async () => {
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })
    });

    if (!response.ok) {
      throw new Error(`OAuth2 exchange failed: ${await response.text()}`);
    }

    const tokens = await response.json();
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    if (!userRes.ok) {
      throw new Error(`Failed to fetch user data: ${await userRes.text()}`);
    }

    const profile = await userRes.json();
    const accounts = loadLinkedAccounts();
    accounts[profile.id] = {
      username: profile.username,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000)
    };
    saveLinkedAccounts(accounts);

    await updateConnectionMetadata(profile.id, profile.username, tokens.access_token);

    if (ctx.client && ctx.isDiscordReady()) {
      try {
        const guild = await ctx.client.guilds.fetch(ctx.GUILD_ID);
        const member = await guild.members.fetch(profile.id).catch(() => null);
        if (member) {
          await ctx.updatePlayerProgressRoles(member, `sim-discord-${profile.id}`);
        }
      } catch (err) {
        console.warn("⚠️ Failed to update progress roles immediately after link:", err.message);
      }
    }

    const dataToCache = { username: profile.username, timestamp: Date.now() };
    EXCHANGED_CODES.set(code, dataToCache);
    return dataToCache;
  })();

  PENDING_EXCHANGES.set(code, exchangePromise);

  try {
    const result = await exchangePromise;
    res.send(`
      <html>
        <body style="background:#0a0a0a; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2 style="color:#57F287;">Koneksi Berhasil!</h2>
          <p>Akun Discord @${result.username} telah terhubung dengan kasta stage teater.</p>
          <p style="color:gray; font-size:12px;">Anda dapat menutup jendela ini dan kembali ke teater.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("OAuth2 exchange failed: " + err.message);
  } finally {
    PENDING_EXCHANGES.delete(code);
  }
});

router.get('/api/discord-role/:roleId', async (req, res) => {
  const { roleId } = req.params;
  if (!ctx.client || !ctx.isDiscordReady()) {
    return res.status(503).json({ error: "Discord client is not ready." });
  }
  try {
    const guild = await ctx.client.guilds.fetch(ctx.GUILD_ID);
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return res.status(404).json({ error: "Role Discord tidak ditemukan." });
    }

    const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
    let cvAmount = 0;
    if (cvMatch) {
      const cvStr = cvMatch[1].trim();
      cvAmount = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
    }

    res.json({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      cvAmount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/submissions/approve', requireClientToken, async (req, res) => {
  const { submissionId, adminId } = req.body;
  if (!submissionId || !adminId) {
    return res.status(400).json({ error: "submissionId dan adminId wajib diisi." });
  }

  const submissions = ctx.loadLocalSubmissions();
  const subIdx = submissions.findIndex(s => s.id === submissionId);
  if (subIdx === -1) {
    return res.status(404).json({ error: "Bukti submission tidak ditemukan." });
  }

  const sub = submissions[subIdx];
  if (sub.status !== "pending") {
    return res.status(400).json({ error: `Persetujuan ditolak. Status saat ini: ${sub.status}` });
  }

  try {
    sub.status = "Completed";
    sub.reviewedBy = adminId;
    sub.reviewedAt = new Date().toISOString();
    ctx.saveLocalSubmissions(submissions);

    const decks = ctx.loadLocalDecks();
    const userDeck = decks[sub.userId] || { dealt: false, cards: [], statuses: {} };
    userDeck.statuses[sub.questId] = "Completed";
    decks[sub.userId] = userDeck;
    ctx.saveLocalDecks(decks);

    const localUsers = ctx.loadLocalUsers();
    const user = localUsers[sub.userId] || { uid: sub.userId, name: sub.username, cv: 0, points: 0 };
    
    let addedPoints = sub.questPoints;
    let givenRole = null;

    if (sub.questRoleRewardId) {
      givenRole = sub.questRoleRewardName || "Role Tambahan";
      if (ctx.client && ctx.isDiscordReady()) {
        try {
          const guild = await ctx.client.guilds.fetch(ctx.GUILD_ID);
          const match = sub.userId.match(/\d{17,20}/);
          if (match) {
            const member = await guild.members.fetch(match[0]).catch(() => null);
            if (member) {
              const role = await guild.roles.fetch(sub.questRoleRewardId).catch(() => null);
              if (role) {
                await member.roles.add(role);
                console.log(`[Submission] Menambahkan role ${role.name} ke member ${member.user.tag}`);
              }
            }
          }
        } catch (e) {
          console.error("Gagal menambahkan role reward ke Discord user:", e.message);
        }
      }
    }

    user.cv = (user.cv || 0) + addedPoints;
    user.points = (user.points || 0) + addedPoints;
    localUsers[sub.userId] = user;
    ctx.saveLocalUsers(localUsers);

    if (ctx.client && ctx.isDiscordReady()) {
      try {
        const match = sub.userId.match(/\d{17,20}/);
        if (match) {
          const guild = await ctx.client.guilds.fetch(ctx.GUILD_ID);
          const member = await guild.members.fetch(match[0]).catch(() => null);
          if (member) {
            await ctx.updatePlayerProgressRoles(member, sub.userId);
          }
        }
      } catch (err) {
        console.error("Gagal update role progress otomatis setelah persetujuan:", err.message);
      }
    }

    try {
      const accounts = loadLinkedAccounts();
      const match = sub.userId.match(/\d{17,20}/);
      if (match) {
        const discordId = match[0];
        const acc = accounts[discordId];
        if (acc && acc.access_token) {
          let token = acc.access_token;
          if (Date.now() > (acc.expires_at - 300000)) {
            token = await refreshAccessToken(discordId, acc.refresh_token);
          }
          if (token) {
            await updateConnectionMetadata(discordId, acc.username, token);
          }
        }
      }
    } catch (e) {
      console.error("Gagal sinkronisasi metadata otomatis setelah approve:", e.message);
    }

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', sub.userId);
    }

    res.json({ success: true, message: "Bukti disetujui.", submission: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/submissions/reject', requireClientToken, async (req, res) => {
  const { submissionId, adminId } = req.body;
  if (!submissionId || !adminId) {
    return res.status(400).json({ error: "submissionId dan adminId wajib diisi." });
  }

  const submissions = ctx.loadLocalSubmissions();
  const subIdx = submissions.findIndex(s => s.id === submissionId);
  if (subIdx === -1) {
    return res.status(404).json({ error: "Submission tidak ditemukan." });
  }

  const sub = submissions[subIdx];
  if (sub.status !== "pending") {
    return res.status(400).json({ error: `Penolakan gagal. Status: ${sub.status}` });
  }

  try {
    sub.status = "Denied";
    sub.reviewedBy = adminId;
    sub.reviewedAt = new Date().toISOString();
    ctx.saveLocalSubmissions(submissions);

    const decks = ctx.loadLocalDecks();
    const userDeck = decks[sub.userId] || { dealt: false, cards: [], statuses: {} };
    userDeck.statuses[sub.questId] = "Denied";
    decks[sub.userId] = userDeck;
    ctx.saveLocalDecks(decks);

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', sub.userId);
    }

    res.json({ success: true, message: "Bukti ditolak.", submission: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/submissions/submit', requireClientToken, async (req, res) => {
  const { questId, userId, username, userEmail, fileName, mediaData } = req.body;
  if (!questId || !userId || !username || !fileName || !mediaData) {
    return res.status(400).json({ error: "Payload tidak lengkap untuk submit bukti." });
  }

  try {
    const quests = ctx.loadLocalQuests();
    const quest = quests.find(q => q.id === questId);
    if (!quest) {
      return res.status(404).json({ error: "Quest tidak ditemukan di database." });
    }

    const decks = ctx.loadLocalDecks();
    const userDeck = decks[userId] || { dealt: false, cards: [], statuses: {} };
    
    if (userDeck.statuses[questId] === "Completed" || userDeck.statuses[questId] === "pending") {
      return res.status(400).json({ error: "Quest ini sudah selesai atau sedang dalam antrean peninjauan." });
    }

    // Decode media to buffer
    const base64Content = mediaData.split(';base64,').pop();
    const fileBuffer = Buffer.from(base64Content, 'base64');
    
    // Save locally
    const uploadDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const filePath = path.join(uploadDir, safeFileName);
    fs.writeFileSync(filePath, fileBuffer);

    // Save submission data
    const submissions = ctx.loadLocalSubmissions();
    const newSub = {
      id: `sub-${Date.now()}`,
      questId,
      questTitle: quest.title,
      questPoints: quest.points,
      questRoleRewardId: quest.roleId || null,
      questRoleRewardName: quest.roleName || null,
      userId,
      username,
      userEmail,
      fileName: safeFileName,
      fileUrl: `/uploads/${safeFileName}`,
      status: "pending",
      submittedAt: new Date().toISOString()
    };
    
    submissions.push(newSub);
    ctx.saveLocalSubmissions(submissions);

    // Update deck status
    userDeck.statuses[questId] = "pending";
    decks[userId] = userDeck;
    ctx.saveLocalDecks(decks);

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', userId);
    }

    res.json({ success: true, message: "Bukti berhasil diunggah.", submission: newSub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/submissions', (req, res) => {
  res.json(ctx.loadLocalSubmissions());
});

router.post('/api/submissions/reset-specific', requireClientToken, async (req, res) => {
  const { userId, questId } = req.body;
  if (!userId || !questId) {
    return res.status(400).json({ error: "userId dan questId harus diisi." });
  }
  try {
    const decks = ctx.loadLocalDecks();
    const userDeck = decks[userId];
    if (userDeck && userDeck.statuses[questId]) {
      delete userDeck.statuses[questId];
      decks[userId] = userDeck;
      ctx.saveLocalDecks(decks);
    }

    const submissions = ctx.loadLocalSubmissions();
    const filtered = submissions.filter(s => !(s.userId === userId && s.questId === questId));
    ctx.saveLocalSubmissions(filtered);

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', userId);
    }

    res.json({ success: true, message: `Poin & progress quest ${questId} di-reset untuk user ${userId}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/submissions/reset-all', requireClientToken, async (req, res) => {
  try {
    ctx.saveLocalDecks({});
    ctx.saveLocalSubmissions([]);
    res.json({ success: true, message: "Semua data decks & submissions berhasil dibersihkan total." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/decks/:uid', async (req, res) => {
  const { uid } = req.params;
  const userDeck = await ctx.getUserDeck(uid);
  res.json(userDeck);
});

router.post('/api/decks/deal', requireClientToken, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId wajib diisi." });
  }

  try {
    const quests = ctx.loadLocalQuests();
    const dealtCards = [];
    const list = [...quests];

    for (let i = 0; i < 3; i++) {
      if (list.length === 0) break;
      const idx = Math.floor(Math.random() * list.length);
      dealtCards.push(list.splice(idx, 1)[0]);
    }

    const decks = ctx.loadLocalDecks();
    const userDeck = decks[userId] || { dealt: false, cards: [], statuses: {} };
    userDeck.dealt = true;
    userDeck.cards = dealtCards;
    
    // Set cards to active
    dealtCards.forEach(c => {
      userDeck.statuses[c.id] = "active";
    });

    decks[userId] = userDeck;
    ctx.saveLocalDecks(decks);

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', userId);
    }

    res.json({ success: true, deck: userDeck });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/decks/update-status', requireClientToken, async (req, res) => {
  const { userId, questId, status } = req.body;
  if (!userId || !questId || !status) {
    return res.status(400).json({ error: "userId, questId, dan status wajib diisi." });
  }

  try {
    const decks = ctx.loadLocalDecks();
    const userDeck = decks[userId] || { dealt: false, cards: [], statuses: {} };
    userDeck.statuses[questId] = status;
    decks[userId] = userDeck;
    ctx.saveLocalDecks(decks);

    if (global.broadcastWsUpdate) {
      global.broadcastWsUpdate('quests', userId);
    }

    res.json({ success: true, deck: userDeck });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/quests', (req, res) => {
  res.json(ctx.loadLocalQuests());
});

router.post('/api/quests', requireClientToken, async (req, res) => {
  const { akt, title, description, difficulty, points, roleId, roleName, roleColor, roleCv } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: "Judul dan objektif quest wajib diisi." });
  }

  try {
    const quests = ctx.loadLocalQuests();
    const newQuest = {
      id: `quest-${Date.now()}`,
      akt: akt || "Akt I",
      title,
      description,
      difficulty: difficulty || "Mudah",
      points: Number(points) || 0,
      roleId: roleId || null,
      roleName: roleName || null,
      roleColor: roleColor || null,
      roleCv: roleCv || null
    };

    quests.push(newQuest);
    ctx.saveLocalQuests(quests);

    res.json({ success: true, quest: newQuest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/quests/:id', requireClientToken, async (req, res) => {
  const { id } = req.params;
  try {
    const quests = ctx.loadLocalQuests();
    const filtered = quests.filter(q => q.id !== id);
    ctx.saveLocalQuests(filtered);
    res.json({ success: true, message: `Quest ${id} berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/quests/load-defaults', requireClientToken, async (req, res) => {
  try {
    const DEFAULT_QUESTS = [
      { id: "default-1", akt: "Akt I", title: "Tebak Member Anomaly", description: "Sebutkan nama member Anomaly terpopuler malam ini di voice channel utama beserta alasannya!", difficulty: "Mudah", points: 10 },
      { id: "default-2", akt: "Akt I", title: "Sekte Kerupuk vs Keripik", description: "Bujuk 2 member offline untuk online dan memilih kubu garing di channel #roles!", difficulty: "Sedang", points: 25 },
      { id: "default-3", akt: "Akt II", title: "Karaoke 1 Menit", description: "Nyanyikan sepenggal lagu favoritmu di Voice Channel selama minimal 1 menit!", difficulty: "Sedang", points: 30 },
      { id: "default-4", akt: "Akt II", title: "Kolektor Kerupuk Teater", description: "Kumpulkan 100 poin kerupuk dalam game panggung utama dalam waktu 5 menit!", difficulty: "Sulit", points: 50 },
      { id: "default-5", akt: "Akt III", title: "Misteri Admin Bahagia", description: "Cari tahu alasan kenapa admin utama CrunchyVerse sedang bahagia malam ini!", difficulty: "Legendaris", points: 100 }
    ];

    const quests = ctx.loadLocalQuests();
    DEFAULT_QUESTS.forEach(dq => {
      if (!quests.some(q => q.title === dq.title)) {
        quests.push({ ...dq, id: `default-${Date.now()}-${Math.floor(Math.random()*1000)}` });
      }
    });

    ctx.saveLocalQuests(quests);
    res.json({ success: true, quests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/quests/delete-all', requireClientToken, async (req, res) => {
  try {
    ctx.saveLocalQuests([]);
    res.json({ success: true, message: "Semua data quest berhasil dibersihkan total." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/linked-role/update-metadata', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId wajib diisi." });
  }

  const accounts = loadLinkedAccounts();
  const acc = accounts[userId];
  if (!acc) {
    return res.status(404).json({ error: "Akun tidak terhubung." });
  }

  let token = acc.access_token;
  if (Date.now() > (acc.expires_at - 300000)) {
    token = await refreshAccessToken(userId, acc.refresh_token);
  }

  if (!token) {
    return res.status(500).json({ error: "Failed to authenticate or refresh token." });
  }

  const success = await updateConnectionMetadata(userId, acc.username, token);
  if (success) {
    res.json({ success: true, message: `Pembaruan data metadata untuk @${acc.username} sukses!` });
  } else {
    res.status(500).json({ error: "Failed to push statistics to Discord." });
  }
});

// Manual widget sync endpoint — doesn't require linked OAuth account
// Uses bot token directly; accepts plain Discord User ID
router.post('/api/widget/sync', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId wajib diisi.' });
  }

  // Try both id formats: plain Discord ID and sim-discord-<id>
  const plainId = userId.replace('sim-discord-', '');
  const simId = userId.startsWith('sim-discord-') ? userId : `sim-discord-${userId}`;

  let stats = { level: 0, voice: 0, streak: 0, cv_wealth: 0 };

  try {
    const lbUrl = `http://localhost:${ctx.PORT}/api/leaderboard`;
    const lbRes = await fetch(lbUrl);
    if (lbRes.ok) {
      const data = await lbRes.json();
      const tryIds = [plainId, simId];

      const levelUser  = data.leveling?.find(u => tryIds.includes(u.id));
      const streakUser = data.streak?.find(u => tryIds.includes(u.id));
      const voiceUser  = data.voice?.find(u => tryIds.includes(u.id));
      const cvUser     = data.cvWealth?.find(u => tryIds.includes(u.id));

      stats = {
        level:     levelUser?.level || 0,
        streak:    streakUser?.streak || 0,
        voice:     voiceUser?.hours || 0,
        cv_wealth: parseInt((cvUser?.cvAmount || '0').replace(/\./g, ''), 10) || 0,
      };
    }
  } catch (err) {
    console.error('[Widget Sync] Gagal fetch leaderboard:', err.message);
  }

  console.log(`[Widget Sync] Menyinkronkan ${plainId}:`, stats);
  const success = await updateDiscordProfileWidget(plainId, stats);

  if (success) {
    res.json({ success: true, stats, message: 'Widget berhasil disinkronisasi!' });
  } else {
    res.status(500).json({ error: 'Gagal update widget Discord.', stats });
  }
});

// Initialization function
function initRoleConnections(context) {
  Object.assign(ctx, context);
  
  // Start the metadata sync cycle every 8 hours
  setInterval(runMetadataSyncCycle, 8 * 60 * 60 * 1000);
  
  return {
    router,
    loadLinkedAccounts,
    saveLinkedAccounts,
    updateConnectionMetadata,
    refreshAccessToken,
    runMetadataSyncCycle,
    installUserProfileWidget
  };
}

module.exports = {
  initRoleConnections
};
