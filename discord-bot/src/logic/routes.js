const crypto = require('crypto');
const { ChannelType, EmbedBuilder } = require('discord.js');
const { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where } = require('firebase/firestore');

const state = require('../utils/state');
const db = require('../utils/db');
const helpers = require('../utils/helpers');
const voice = require('../utils/voice');
const tiktok = require('../utils/tiktok');
const rank = require('../utils/rank');
const discordUtil = require('../utils/discord');

const PORT = process.env.PORT || 3001;
const GUILD_ID = process.env.GUILD_ID;
const CV_API_SECRET = process.env.CV_API_SECRET || 'crunchyverse-stage-2026-secret';
const TOKEN_EXPIRY_SECONDS = 60; // Valid for 60s to tolerate latency

// ================== AES-256-GCM DECRYPTION ==================
function decryptPayload(obfuscatedPayload) {
  try {
    const combined = Buffer.from(obfuscatedPayload, 'base64');
    if (combined.length < 28) {
      throw new Error("Payload terlalu pendek");
    }

    const iv = combined.subarray(0, 12);
    const encryptedWithTag = combined.subarray(12);

    const tag = encryptedWithTag.subarray(encryptedWithTag.length - 16);
    const ciphertext = encryptedWithTag.subarray(0, encryptedWithTag.length - 16);

    const secretKey = CV_API_SECRET.slice(0, 32).padEnd(32, '0');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(secretKey), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error("❌ Dekripsi payload gagal:", err.message);
    throw err;
  }
}

function decodePayload(req, res, next) {
  if (req.headers['x-cv-encoded'] === '1' && req.body && req.body._d) {
    try {
      req.body = decryptPayload(req.body._d);
    } catch (e) {
      console.error("❌ [Security] Decryption/Parsing payload gagal:", e.message);
      return res.status(400).json({ error: 'Payload tidak valid atau rusak.' });
    }
  }
  next();
}

// ================== HMAC TOKEN VALIDATION ==================
function verifyRequestToken(token, path) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length < 2) return false;

  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOKEN_EXPIRY_SECONDS) {
    return false;
  }

  const message = `${path}:${timestamp}`;
  const expectedSig = crypto
    .createHmac('sha256', CV_API_SECRET)
    .update(message)
    .digest('base64');

  const receivedSig = parts.slice(1).join('.');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(receivedSig)
    );
  } catch {
    return false;
  }
}

function requireClientToken(req, res, next) {
  const token = req.headers['x-cv-client-token'];
  const path = req.path;

  if (!verifyRequestToken(token, path)) {
    console.warn(`[Security] Invalid/missing client token dari ${req.ip} untuk ${req.method} ${path}`);
    return res.status(403).json({ error: 'Akses ditolak.' });
  }
  next();
}

// ================== HELPER FUNCTIONS ==================
async function syncVolunteerablesFromFirestore() {
  if (!state.db) return;
  try {
    console.log("🔄 [Volunteerables] Memulai sinkronisasi dari Firestore...");
    const querySnapshot = await state.withTimeout(getDocs(collection(state.db, "volunteerables")), 5000);
    const list = [];
    querySnapshot.forEach(doc => {
      list.push(doc.data());
    });
    if (list.length > 0) {
      db.saveLocalVolunteerables(list);
      console.log(`🔄 [Volunteerables] Berhasil sinkronisasi ${list.length} data dari Firestore ke lokal.`);
    }
  } catch (err) {
    console.warn("⚠️ [Volunteerables] Gagal sinkronisasi dari Firestore:", err.message);
  }
}

async function updateDiscordProfileWidget(userId, stats) {
  const appId = process.env.DISCORD_CLIENT_ID;
  const botToken = process.env.DISCORD_TOKEN;
  if (!appId || !botToken) return false;

  const url = `https://discord.com/api/v9/applications/${appId}/users/${userId}/identities/0/profile`;
  const payload = {
    data: {
      dynamic: [
        { type: 1, name: "level", value: String(stats.level) },
        { type: 1, name: "voice", value: String(stats.voice) },
        { type: 1, name: "streak", value: String(stats.streak) },
        { type: 1, name: "cv_wealth", value: String(stats.cv_wealth) }
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
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function updateConnectionMetadata(userId, username, accessToken) {
  const stats = await getUserStats(userId);
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
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function refreshAccessToken(userId, refreshToken) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    if (!response.ok) throw new Error(`Refresh failed: ${await response.text()}`);
    const tokens = await response.json();
    const accounts = db.loadLinkedAccounts();

    if (accounts[userId]) {
      accounts[userId].access_token = tokens.access_token;
      accounts[userId].refresh_token = tokens.refresh_token;
      accounts[userId].expires_at = Date.now() + (tokens.expires_in * 1000);
      db.saveLinkedAccounts(accounts);
      return tokens.access_token;
    }
  } catch (err) {
    console.error(`❌ [OAuth] Gagal me-refresh token untuk user ID ${userId}:`, err.message);
  }
  return null;
}

async function runMetadataSyncCycle() {
  console.log(`\n🔄 [OAuth] ====== Memulai sinkronisasi metadata Discord ======`);
  const accounts = db.loadLinkedAccounts();
  const userIds = Object.keys(accounts);

  if (userIds.length === 0) return;

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

async function getUserStats(userId) {
  let level = 1, voice = 0, streak = 0, cv_wealth = 0;
  const accounts = db.loadLinkedAccounts();
  const userAcc = accounts[userId];
  const username = userAcc ? userAcc.username : null;

  const targetIds = [userId];
  const targetUsernames = [];
  if (username) targetUsernames.push(username);

  try {
    const lbUrl = `http://localhost:${PORT}/api/leaderboard`;
    const res = await fetch(lbUrl);
    if (res.ok) {
      const data = await res.json();
      const levelEntries = data.leveling.filter(u => targetIds.includes(u.id) || targetUsernames.includes(u.username));
      if (levelEntries.length > 0) level = Math.max(...levelEntries.map(u => u.level || 1));

      const streakEntries = data.streak.filter(u => targetIds.includes(u.id) || targetUsernames.includes(u.username));
      if (streakEntries.length > 0) streak = Math.max(...streakEntries.map(u => u.streak || 0));

      const voiceEntries = data.voice.filter(u => targetIds.includes(u.id) || targetUsernames.includes(u.username));
      if (voiceEntries.length > 0) voice = Math.max(...voiceEntries.map(u => u.hours || 0));

      const cvEntries = data.cvWealth.filter(u => targetIds.includes(u.id) || targetUsernames.includes(u.username));
      if (cvEntries.length > 0) {
        cv_wealth = Math.max(...cvEntries.map(u => {
          const rawAmount = u.cvAmount || "0";
          return parseInt(rawAmount.replace(/\./g, ''), 10) || 0;
        }));
      }
    }
  } catch (err) {}
  return { level, voice, streak, cv_wealth };
}

// ================== REGISTER ROUTES ==================
function registerRoutes(app) {
  // Apply obfuscation decode middleware
  app.use(decodePayload);

  // Sync endpoint
  const { gatherSyncData } = require('./sync');
  app.post('/api/sync', async (req, res) => {
    try {
      const response = await gatherSyncData(req.body);
      res.json(response);
    } catch (err) {
      console.error("❌ Error in POST /api/sync:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET VoiceAFK status
  app.get('/api/voice-afk/status', (req, res) => {
    let guilds = [];
    let inviteLink = null;
    if (state.client && state.isDiscordReady) {
      inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${state.client.user.id}&permissions=3145728&scope=bot`;
      try {
        guilds = state.client.guilds.cache.map(g => {
          const voiceChannels = g.channels.cache
            .filter(c => c.type === ChannelType.GuildVoice)
            .map(c => ({ id: c.id, name: c.name }));
          return { id: g.id, name: g.name, icon: g.iconURL(), channels: voiceChannels };
        });
      } catch (err) {}
    }
    res.json({
      ...state.connectionState,
      guilds,
      inviteLink
    });
  });

  // POST connect bot to voice
  app.post('/api/voice-afk/connect', requireClientToken, async (req, res) => {
    const { guildId, channelId } = req.body;
    if (!guildId || !channelId) {
      return res.status(400).json({ error: 'guildId dan channelId wajib diisi.' });
    }
    try {
      if (!state.client || !state.isDiscordReady) {
        return res.status(400).json({ success: false, message: 'Klien Discord belum login.' });
      }
      voice.addVoiceAfkLog(`Menerima perintah sambung ke Voice Channel: Guild ${guildId}, Channel ${channelId}`, 'info');
      await voice.connectToVoiceChannel(guildId, channelId);
      res.json({ success: true, message: 'Berhasil tersambung.', state: state.connectionState });
    } catch (err) {
      state.connectionState.status = state.client && state.isDiscordReady ? 'ready' : 'offline';
      voice.addVoiceAfkLog(`Gagal menyambung ke voice channel: ${err.message}`, 'error');
      res.status(500).json({ success: false, message: `Error koneksi: ${err.message}` });
    }
  });

  // POST disconnect bot from voice
  app.post('/api/voice-afk/disconnect', requireClientToken, (req, res) => {
    const { getVoiceConnection } = require('@discordjs/voice');
    if (!state.connectionState.isConnectedToVoice || !state.connectionState.guildId) {
      return res.json({ success: true, message: 'Bot sedang tidak tersambung ke voice channel mana pun.', state: state.connectionState });
    }
    try {
      const guildId = state.connectionState.guildId;
      const channelId = state.connectionState.channelId;
      voice.addVoiceAfkLog(`Menerima perintah putus koneksi dari Voice Channel di server ${guildId}...`, 'info');

      const connection = getVoiceConnection(guildId);
      if (connection) {
        connection.destroy();
      }

      state.connectionState.isConnectedToVoice = false;
      state.connectionState.guildId = null;
      state.connectionState.channelId = null;
      state.connectionState.status = 'ready';

      voice.addVoiceAfkLog('Koneksi suara diputuskan secara bersih.', 'success');
      db.saveVoiceAfkConfig({ guildId, channelId, isConnected: false });

      res.json({ success: true, message: 'Berhasil memutuskan koneksi dari voice channel.', state: state.connectionState });
    } catch (error) {
      voice.addVoiceAfkLog(`Gagal memutuskan koneksi suara: ${error.message}`, 'error');
      res.status(500).json({ success: false, message: `Error diskoneksi: ${error.message}` });
    }
  });

  // POST clear logs
  app.post('/api/voice-afk/logs/clear', requireClientToken, (req, res) => {
    state.connectionState.logs = [];
    voice.addVoiceAfkLog('Log konsol dibersihkan oleh web client.', 'info');
    res.json({ success: true });
  });

  // GET TikTok status
  app.get('/api/tiktok', (req, res) => {
    res.json(state.tiktokState);
  });

  // POST TikTok manual status override
  app.post('/api/tiktok/override', requireClientToken, async (req, res) => {
    const { isLive, liveTitle } = req.body;
    if (isLive === undefined) {
      return res.status(400).json({ error: "isLive wajib diisi" });
    }
    state.tiktokState.manualOverride = true;
    state.tiktokState.isLive = isLive;
    state.tiktokState.liveTitle = isLive ? (liveTitle || "🎪 STAGE LIVE: Nobar Konser & Chit-chat Bareng Member Anomaly! 🍿") : null;
    console.log(`📡 [LiveStatusOverride] Status TikTok live di-override secara manual: isLive=${isLive}, title="${state.tiktokState.liveTitle}"`);

    await tiktok.updateDiscordLiveStatusChannels();
    if (typeof tiktok.handleLiveAnnouncement === 'function') {
      await tiktok.handleLiveAnnouncement(isLive, state.tiktokState.liveTitle, state.tiktokState.avatarUrl);
    }
    res.json({ success: true, status: state.tiktokState });
  });

  // GET general Discord stats
  app.get('/api/stats', async (req, res) => {
    const cacheKey = 'api:stats';
    let statsData = state.cache.get(cacheKey);
    if (!statsData) {
      const syncRes = await gatherSyncData({});
      statsData = syncRes.stats;
    }
    res.json(statsData);
  });

  // GET broadcasts
  app.get('/api/broadcasts', async (req, res) => {
    const cacheKey = 'api:broadcasts';
    let broadcastsData = state.cache.get(cacheKey);
    if (!broadcastsData) {
      const syncRes = await gatherSyncData({});
      broadcastsData = syncRes.broadcasts;
    }
    res.json(broadcastsData);
  });

  // GET specific Discord User profile (plain fetch by Snowflake)
  app.get('/api/discord-user/:id', async (req, res) => {
    const { id } = req.params;
    if (!state.isDiscordReady || !state.client) {
      return res.status(503).json({ error: "Discord client is not ready" });
    }
    try {
      const user = await state.client.users.fetch(id);
      if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.globalName || user.username,
        avatar: user.displayAvatarURL({ extension: 'webp', size: 128 })
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET user info and CV points by UID
  app.get('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    let discordId = null;
    const match = uid.match(/\d{17,20}/);
    if (match) discordId = match[0];

    let liveCv = 0;
    let hasLiveCv = false;

    if (state.isDiscordReady && state.client && discordId) {
      try {
        const guild = await state.client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member) {
          const roles = await guild.roles.fetch();
          const roleCvMap = new Map();
          roles.forEach(role => {
            if (role.name !== "@everyone" && !role.managed && !state.EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
              const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
              if (cvMatch) {
                const cvStr = cvMatch[1].trim();
                const cvVal = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
                roleCvMap.set(role.id, cvVal);
              }
            }
          });
          member.roles.cache.forEach(role => {
            const roleCv = roleCvMap.get(role.id);
            if (roleCv) liveCv += roleCv;
          });
          hasLiveCv = true;
        }
      } catch (err) {
        console.warn("⚠️ Gagal menghitung live CV dari Discord:", err.message);
      }
    }

    const localUsers = db.loadLocalUsers();
    const userData = localUsers[uid] || { uid, name: "Pemain Teater", cv: 0, points: 0 };

    if (hasLiveCv) {
      userData.cv = liveCv;
      userData.points = liveCv;
      localUsers[uid] = userData;
      db.saveLocalUsers(localUsers);
    }
    res.json(userData);
  });

  // GET Voice channel metadata details
  app.get('/api/voice-channel/:id', async (req, res) => {
    const { id } = req.params;
    if (!state.isDiscordReady || !state.client) {
      return res.status(503).json({ error: "Discord client is not ready" });
    }
    try {
      const channel = await state.client.channels.fetch(id);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        return res.status(404).json({ error: "Kanal suara tidak ditemukan" });
      }
      res.json({ id: channel.id, name: channel.name, type: "voice" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET Guild Roles list
  app.get('/api/roles', async (req, res) => {
    const mockRoles = [
      {
        id: "1505186956731093113",
        name: "Serial #1 — Crescent Eclipse | CV$ 12.982.500",
        color: "#ffc107",
        icon: "https://api.dicebear.com/7.x/identicon/svg?seed=crescent",
        cvAmount: "12.982.500",
        permissions: ["MANAGE_MESSAGES", "VIEW_CHANNEL", "SEND_MESSAGES"],
        members: [
          { id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae" },
          { id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim" }
        ]
      },
      {
        id: "1403300491214983178",
        name: "Sekte Kerupuk Gurih | CV$ 420.000",
        color: "#ff3366",
        icon: "https://api.dicebear.com/7.x/identicon/svg?seed=kerupuk",
        cvAmount: "420.000",
        permissions: ["VIEW_CHANNEL", "SEND_MESSAGES", "USE_EXTERNAL_EMOJIS"],
        members: [
          { id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae" }
        ]
      },
      {
        id: "1411319287720837230",
        name: "Sekte Keripik Renyah | CV$ 690.000",
        color: "#ff9900",
        icon: "https://api.dicebear.com/7.x/identicon/svg?seed=keripik",
        cvAmount: "690.000",
        permissions: ["VIEW_CHANNEL", "SEND_MESSAGES", "ATTACH_FILES"],
        members: [
          { id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim" }
        ]
      }
    ];

    if (!state.isDiscordReady || !state.client || !GUILD_ID) {
      console.log("🤖 [API/roles] Discord Bot offline/standby. Mengembalikan list role simulasi.");
      return res.json(mockRoles);
    }

    try {
      console.log("🤖 [API/roles] Menghubungkan ke Discord Guild...");
      const guild = await state.client.guilds.fetch(GUILD_ID);
      if (!guild) {
        console.log("⚠️ [API/roles] Guild tidak ditemukan. Mengembalikan list role simulasi.");
        return res.json(mockRoles);
      }
      if (guild.members.cache.size === 0) {
        console.log("👥 [API/roles] Cache kosong, memuat member server...");
        await guild.members.fetch().catch(err => {
          console.warn("⚠️ [API/roles] Gagal memuat semua member secara langsung:", err.message);
        });
      } else {
        console.log(`👥 [API/roles] Menggunakan ${guild.members.cache.size} member ter-cache.`);
      }

      const roles = await guild.roles.fetch();
      console.log(`✅ [API/roles] Berhasil membaca ${roles.size} role dari server Discord.`);

      const formattedRoles = roles
        .filter(role => role.name !== "@everyone" && !role.managed)
        .map(role => {
          const cvMatch = !state.EXCLUDED_CV_ROLE_IDS.includes(role.id)
            ? role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i)
            : null;
          const cvAmount = cvMatch ? cvMatch[1].trim() : null;

          const members = role.members.map(member => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null
          }));

          const permissions = role.permissions.toArray();
          let gradientColors = null;
          try {
            if (role.colors && Array.isArray(role.colors) && role.colors.length >= 2) {
              gradientColors = role.colors
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map(c => {
                  const hex = (c.color ?? c).toString(16).padStart(6, '0');
                  return `#${hex}`;
                });
            } else if (typeof role.colors === 'object' && role.colors !== null && !Array.isArray(role.colors)) {
              const colorValues = Object.values(role.colors).filter(v => typeof v === 'number');
              if (colorValues.length >= 2) {
                gradientColors = colorValues.map(c => `#${c.toString(16).padStart(6, '0')}`);
              }
            }
          } catch (e) {
            gradientColors = null;
          }

          return {
            id: role.id,
            name: role.name,
            color: role.hexColor,
            gradientColors,
            icon: role.iconURL({ extension: 'png', size: 128 }) || null,
            position: role.position,
            cvAmount,
            permissions,
            members
          };
        })
        .sort((a, b) => b.position - a.position);

      if (formattedRoles.length === 0) {
        return res.json(mockRoles);
      }
      res.json(formattedRoles);
    } catch (err) {
      console.error(`❌ [API/roles] Gagal mengambil roles: ${err.message}`);
      res.json(mockRoles);
    }
  });

  // GET Leaderboards
  const mockLeaderboard = {
    leveling: [
      { rank: 1, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", level: 64, xp: 14200, nextXp: 15000 },
      { rank: 2, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", level: 58, xp: 9800, nextXp: 12000 }
    ],
    streak: [
      { rank: 1, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", streak: 124 },
      { rank: 2, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", streak: 92 }
    ],
    voice: [
      { rank: 1, id: "sim-user-1", username: "garingmania", displayName: "GaringMania 🍿", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=garing", hours: 840 },
      { rank: 2, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", hours: 620 }
    ],
    cvWealth: [
      { rank: 1, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", cvAmount: "13.672.500", roleName: "Serial #1 — Crescent Eclipse", roles: [{ name: "Serial #1 — Crescent Eclipse", value: 12982500, str: "12.982.500", color: "#ffc107" }] }
    ]
  };

  app.get('/api/leaderboard', async (req, res) => {
    const cacheKey = 'api:leaderboard';
    const cached = state.cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    try {
      const guildId = GUILD_ID || '1403255548698300416';
      let resolvedCakey = null;

      try {
        const cakeyUrl = `https://cakey.bot/leaderboard/id/${guildId}?tab=leveling`;
        const browserHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
          'Cache-Control': 'no-cache',
        };

        const VERCEL_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kranciweb.vercel.app';
        const fetchAttempts = [
          () => fetch(cakeyUrl, { headers: browserHeaders, signal: AbortSignal.timeout(6000) })
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))),
          () => fetch(`${VERCEL_URL}/api/cakey-proxy?guildId=${guildId}`, { signal: AbortSignal.timeout(10000) })
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`vercel-proxy HTTP ${r.status}`))),
          () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(cakeyUrl)}`, { headers: browserHeaders, signal: AbortSignal.timeout(8000) })
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`proxy2 HTTP ${r.status}`))),
          () => fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(cakeyUrl)}`, { signal: AbortSignal.timeout(8000) })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`proxy3 HTTP ${r.status}`)))
            .then(data => data.contents),
        ];

        let html = null;
        for (let i = 0; i < fetchAttempts.length; i++) {
          try {
            console.log(`📡 [API/leaderboard] Mencoba fetch Cakey Bot (attempt ${i + 1}/4)...`);
            html = await fetchAttempts[i]();
            console.log(`✅ [API/leaderboard] Berhasil fetch Cakey Bot via attempt ${i + 1}`);
            break;
          } catch (attemptErr) {
            console.warn(`⚠️ [API/leaderboard] Attempt ${i + 1} gagal: ${attemptErr.message}`);
          }
        }

        if (!html) throw new Error('Semua proxy gagal');
        const tables = html.split(/<table/gi);
        if (tables.length < 3) throw new Error("Tidak ada cukup tabel di HTML Cakey Bot");

        const getTdText = (tdStr) => tdStr.substring(tdStr.indexOf('>') + 1).replace(/<[^>]*>/g, '').trim();

        // 1. LEVELING
        const table1 = tables[1];
        const t1Start = table1.indexOf('<tbody>');
        const t1End = table1.indexOf('</tbody>', t1Start);
        if (t1Start === -1 || t1End === -1) throw new Error("Tbody tidak ditemukan di Table 1");
        const t1Rows = table1.substring(t1Start + 7, t1End).split(/<tr/gi).filter(r => r.includes('<td'));

        const levelingList = [];
        t1Rows.forEach((row, idx) => {
          try {
            const tds = row.split(/<td/gi).filter(td => td.includes('</td>'));
            if (tds.length < 5) return;
            let rank = idx + 1;
            const starMatch = tds[0].match(/\/assets\/images\/(\d+)\.svg/);
            if (starMatch) rank = parseInt(starMatch[1], 10);
            const avatarMatch = tds[1].match(/src="([^"]+)"/);
            const avatar = avatarMatch ? avatarMatch[1] : null;
            const usernameMatch = tds[1].match(/<span class="text-sm font-semibold">([^<]+)<\/span>/) || tds[1].match(/<span class="text-theme font-medium">([^<]+)<\/span>/) || tds[1].match(/>\s*([a-zA-Z0-9_.-]+)\s*</);
            const username = usernameMatch ? usernameMatch[1].trim() : 'Unknown';
            const voiceMinutes = parseInt(getTdText(tds[3]).replace(/,/g, ''), 10) || 0;
            const levelMatch = tds[4].match(/Level\s*<span[^>]*>(\d+)<\/span>/i) || tds[4].match(/Level\s*(\d+)/i) || tds[4].match(/(\d+)/);
            const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
            const xpMatch = tds[4].match(/>\s*([\d.MK]+)\s*XP/i);
            const xpStr = xpMatch ? xpMatch[1].trim() : '0';
            let xpVal = xpStr.endsWith('M') ? parseFloat(xpStr) * 1e6 : xpStr.endsWith('K') ? parseFloat(xpStr) * 1e3 : parseFloat(xpStr) || 0;
            const pctMatch = tds[4].match(/style="width:\s*([\d.]+)%/i);
            const pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
            let userIdVal = `cakey-lvl-${rank}`;
            if (avatar) { const m = avatar.match(/\/avatars\/(\d+)\//); if (m) userIdVal = m[1]; }
            levelingList.push({ rank, id: userIdVal, username, displayName: username, avatar, level, xp: xpVal, nextXp: pct > 0 ? Math.round((xpVal / pct) * 100) : Math.round(xpVal * 1.5), voiceMinutes });
          } catch (e) {}
        });

        // 2. STREAKS
        const table2 = tables[2];
        const t2Start = table2.indexOf('<tbody>');
        const t2End = table2.indexOf('</tbody>', t2Start);
        if (t2Start === -1 || t2End === -1) throw new Error("Tbody tidak ditemukan di Table 2");
        const t2Rows = table2.substring(t2Start + 7, t2End).split(/<tr/gi).filter(r => r.includes('<td'));

        const streakList = [];
        t2Rows.forEach((row, idx) => {
          try {
            const tds = row.split(/<td/gi).filter(td => td.includes('</td>'));
            if (tds.length < 3) return;
            let rank = idx + 1;
            const starMatch = tds[0].match(/\/assets\/images\/(\d+)\.svg/);
            if (starMatch) rank = parseInt(starMatch[1], 10);
            const avatarMatch = tds[1].match(/src="([^"]+)"/);
            const avatar = avatarMatch ? avatarMatch[1] : null;
            const usernameMatch = tds[1].match(/<span class="text-sm font-semibold">([^<]+)<\/span>/) || tds[1].match(/<span class="text-theme font-medium">([^<]+)<\/span>/) || tds[1].match(/>\s*([a-zA-Z0-9_.-]+)\s*</);
            const username = usernameMatch ? usernameMatch[1].trim() : 'Unknown';
            const streak = parseInt(getTdText(tds[2]).replace(/,/g, ''), 10) || 0;
            let userIdVal = `cakey-strk-${rank}`;
            if (avatar) { const m = avatar.match(/\/avatars\/(\d+)\//); if (m) userIdVal = m[1]; }
            streakList.push({ rank, id: userIdVal, username, displayName: username, avatar, streak });
          } catch (e) {}
        });

        // 3. VOICE
        const voiceList = [...levelingList]
          .sort((a, b) => b.voiceMinutes - a.voiceMinutes)
          .map((item, idx) => ({ rank: idx + 1, id: item.id, username: item.username, displayName: item.displayName, avatar: item.avatar, hours: Math.round(item.voiceMinutes / 60) }));

        resolvedCakey = { leveling: levelingList, streak: streakList, voice: voiceList };
        console.log(`✅ [API/leaderboard] Sukses parse 3 papan peringkat dari Cakey Bot!`);
      } catch (cakeyErr) {
        console.warn(`⚠️ [API/leaderboard] Cakey Bot tidak tersedia: ${cakeyErr.message}. Menggunakan fallback Discord member.`);
      }

      let finalCvWealth = [];
      try {
        if (state.isDiscordReady && state.client && GUILD_ID) {
          const guild = await state.client.guilds.fetch(GUILD_ID);
          if (guild) {
            let members = guild.members.cache;
            if (members.size === 0) {
              members = await guild.members.fetch().catch(() => guild.members.cache);
            }
            if (members && members.size > 0) {
              const humanMembers = members.filter(m => !m.user.bot);
              const roles = await guild.roles.fetch();
              const roleCvMap = new Map();

              roles.forEach(role => {
                if (role.name !== "@everyone" && !role.managed && !state.EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
                  const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
                  if (cvMatch) {
                    const cvStr = cvMatch[1].trim();
                    const cvVal = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
                    const cleanName = role.name.replace(/\s*\|\s*(?:CV\$|CV|VR|Value\s*Role)\s*[\d.,\s]+/i, "").trim();
                    roleCvMap.set(role.id, { name: cleanName, value: cvVal, str: cvStr });
                  }
                }
              });

              const memberCvWealth = [];
              humanMembers.forEach(member => {
                let totalCvValue = 0;
                let highestCv = 0;
                let highestCvRoleName = null;
                const rolesAcquired = [];

                member.roles.cache.forEach(role => {
                  const roleCv = roleCvMap.get(role.id);
                  if (roleCv) {
                    totalCvValue += roleCv.value;
                    if (roleCv.value > highestCv) {
                      highestCv = roleCv.value;
                      highestCvRoleName = roleCv.name;
                    }
                    rolesAcquired.push({
                      name: roleCv.name,
                      value: roleCv.value,
                      str: roleCv.str,
                      color: role.hexColor
                    });
                  }
                });

                if (totalCvValue > 0) {
                  rolesAcquired.sort((a, b) => b.value - a.value);
                  const cvAmountStr = totalCvValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                  memberCvWealth.push({
                    id: member.id,
                    username: member.user.username,
                    displayName: member.displayName,
                    avatar: member.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
                    cvValue: totalCvValue,
                    cvAmount: cvAmountStr,
                    roleName: highestCvRoleName || "Anggota Teater",
                    roles: rolesAcquired
                  });
                }
              });

              memberCvWealth.sort((a, b) => b.cvValue - a.cvValue);
              for (let i = 0; i < 10; i++) {
                if (memberCvWealth[i]) {
                  finalCvWealth.push({
                    rank: i + 1,
                    id: memberCvWealth[i].id,
                    username: memberCvWealth[i].username,
                    displayName: memberCvWealth[i].displayName,
                    avatar: memberCvWealth[i].avatar,
                    cvAmount: memberCvWealth[i].cvAmount,
                    roleName: memberCvWealth[i].roleName,
                    roles: memberCvWealth[i].roles
                  });
                } else {
                  const mockIdx = i % mockLeaderboard.cvWealth.length;
                  const mockEntry = mockLeaderboard.cvWealth[mockIdx];
                  finalCvWealth.push({
                    ...mockEntry,
                    rank: i + 1,
                    id: mockEntry.id + "-pad"
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ [API/leaderboard] Gagal meresolusi live CV$ wealth: ${err.message}`);
      }

      if (finalCvWealth.length === 0) {
        finalCvWealth = mockLeaderboard.cvWealth;
      }

      if (resolvedCakey) {
        const finalResult = {
          leveling: resolvedCakey.leveling,
          streak: resolvedCakey.streak,
          voice: resolvedCakey.voice,
          cvWealth: finalCvWealth
        };
        state.cache.set(cacheKey, finalResult, 30);
        res.json(finalResult);
      } else {
        let finalLeveling = [];
        let finalStreak = [];
        let finalVoice = [];

        try {
          if (state.isDiscordReady && state.client && GUILD_ID) {
            const guild = await state.client.guilds.fetch(GUILD_ID);
            if (guild) {
              const members = await guild.members.fetch().catch(() => null);
              if (members) {
                const humanMembers = members.filter(m => !m.user.bot);
                const allHumanData = Array.from(humanMembers.values()).map(m => ({
                  id: m.id,
                  username: m.user.username,
                  displayName: m.displayName,
                  avatar: m.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null
                }));

                const mappedMembers = allHumanData.map(m => {
                  const level = helpers.getDeterministicValue(m.id, "level", 1, 65);
                  const xp = helpers.getDeterministicValue(m.id, "xp", 100, 14000);
                  const streak = helpers.getDeterministicValue(m.id, "streak", 1, 150);
                  const hours = helpers.getDeterministicValue(m.id, "hours", 5, 950);
                  return { ...m, level, xp, nextXp: level * 300, streak, hours };
                });

                const levelingList = [...mappedMembers]
                  .sort((a, b) => b.level !== a.level ? b.level - a.level : b.xp - a.xp)
                  .slice(0, 10)
                  .map((m, idx) => ({ rank: idx + 1, id: m.id, username: m.username, displayName: m.displayName, avatar: m.avatar, level: m.level, xp: m.xp, nextXp: m.nextXp }));

                for (let i = 0; i < 10; i++) {
                  if (levelingList[i]) finalLeveling.push(levelingList[i]);
                  else finalLeveling.push({ ...mockLeaderboard.leveling[i % mockLeaderboard.leveling.length], rank: i + 1 });
                }

                const streakList = [...mappedMembers]
                  .sort((a, b) => b.streak - a.streak)
                  .slice(0, 10)
                  .map((m, idx) => ({ rank: idx + 1, id: m.id, username: m.username, displayName: m.displayName, avatar: m.avatar, streak: m.streak }));

                for (let i = 0; i < 10; i++) {
                  if (streakList[i]) finalStreak.push(streakList[i]);
                  else finalStreak.push({ ...mockLeaderboard.streak[i % mockLeaderboard.streak.length], rank: i + 1 });
                }

                const voiceList = [...mappedMembers]
                  .sort((a, b) => b.hours - a.hours)
                  .slice(0, 10)
                  .map((m, idx) => ({ rank: idx + 1, id: m.id, username: m.username, displayName: m.displayName, avatar: m.avatar, hours: m.hours }));

                for (let i = 0; i < 10; i++) {
                  if (voiceList[i]) finalVoice.push(voiceList[i]);
                  else finalVoice.push({ ...mockLeaderboard.voice[i % mockLeaderboard.voice.length], rank: i + 1 });
                }
              }
            }
          }
        } catch (fallbackErr) {
          console.warn("⚠️ Gagal menyusun fallback leaderboard dinamis:", fallbackErr.message);
        }

        if (finalLeveling.length === 0) finalLeveling = mockLeaderboard.leveling;
        if (finalStreak.length === 0) finalStreak = mockLeaderboard.streak;
        if (finalVoice.length === 0) finalVoice = mockLeaderboard.voice;

        const finalResult = { leveling: finalLeveling, streak: finalStreak, voice: finalVoice, cvWealth: finalCvWealth };
        state.cache.set(cacheKey, finalResult, 30);
        res.json(finalResult);
      }
    } catch (err) {
      console.error(`❌ [API/leaderboard] Gagal meresolusi leaderboard: ${err.message}`);
      res.json(mockLeaderboard);
    }
  });

  // POST Rank Roles refresh
  app.post('/api/rank-roles/update', requireClientToken, async (req, res) => {
    try {
      const result = await rank.executeRankRoleUpdate({ silent: false, changedOnly: false });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET specific Discord member display info
  app.get('/api/discord-user/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!state.isDiscordReady || !state.client) {
      return res.status(503).json({ error: "Discord client is not ready" });
    }
    try {
      const user = await state.client.users.fetch(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.globalName || user.username,
        avatar: user.displayAvatarURL({ extension: 'webp', size: 128 })
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all volunteerables
  app.get('/api/volunteerables', async (req, res) => {
    let list = [];
    if (state.db) {
      try {
        const querySnapshot = await state.withTimeout(getDocs(collection(state.db, "volunteerables")), 5000);
        const fsList = [];
        querySnapshot.forEach(doc => { fsList.push(doc.data()); });
        if (fsList.length > 0) {
          list = fsList;
          db.saveLocalVolunteerables(list);
        } else {
          list = db.loadLocalVolunteerables();
        }
      } catch (err) {
        list = db.loadLocalVolunteerables();
      }
    } else {
      list = db.loadLocalVolunteerables();
    }

    const hydratedList = await Promise.all(list.map(async (v) => {
      let username = "", globalName = "", avatarUrl = "";
      if (state.client && state.isDiscordReady) {
        try {
          const user = await state.client.users.fetch(v.discordId);
          username = user.username;
          globalName = user.globalName || user.username;
          avatarUrl = user.displayAvatarURL({ dynamic: true, size: 128 });
        } catch (err) {}
      }
      return { ...v, username, globalName, avatarUrl };
    }));
    res.json(hydratedList);
  });

  app.get('/api/volunteerables/:id', async (req, res) => {
    const { id } = req.params;
    let list = db.loadLocalVolunteerables();
    let isVolunteerable = list.some(v => v.discordId === id);

    if (!isVolunteerable && state.db) {
      try {
        const volDoc = await state.withTimeout(getDoc(doc(state.db, "volunteerables", id)), 3000);
        if (volDoc.exists()) {
          isVolunteerable = true;
          list.push(volDoc.data());
          db.saveLocalVolunteerables(list);
        }
      } catch (e) {}
    }
    res.json({ isVolunteerable });
  });

  app.post('/api/volunteerables', requireClientToken, async (req, res) => {
    const { discordId, addedBy } = req.body;
    if (!discordId) return res.status(400).json({ error: "discordId wajib diisi" });

    const list = db.loadLocalVolunteerables();
    if (!list.some(v => v.discordId === discordId)) {
      list.push({ discordId, addedAt: new Date().toISOString(), addedBy: addedBy || "Sim" });
      db.saveLocalVolunteerables(list);
    }

    try {
      const localUsers = db.loadLocalUsers();
      let updated = false;
      Object.keys(localUsers).forEach(key => {
        const u = localUsers[key];
        if (u.discordId === discordId || u.uid === `sim-discord-${discordId}`) {
          u.role = "Volunteer Theater";
          updated = true;
        }
      });
      if (updated) db.saveLocalUsers(localUsers);
    } catch (e) {}

    if (state.db) {
      try {
        await state.withTimeout(setDoc(doc(state.db, "volunteerables", discordId), { discordId, addedAt: new Date().toISOString(), addedBy: addedBy || "Sim" }));
        const q = query(collection(state.db, "users"), where("discordId", "==", discordId));
        const querySnapshot = await state.withTimeout(getDocs(q));
        for (const userDoc of querySnapshot.docs) {
          await state.withTimeout(updateDoc(doc(state.db, "users", userDoc.id), { role: "Volunteer Theater" }));
        }
      } catch (e) {}
    }
    res.json({ success: true, list });
  });

  app.delete('/api/volunteerables/:id', requireClientToken, async (req, res) => {
    const { id } = req.params;
    let list = db.loadLocalVolunteerables().filter(v => v.discordId !== id);
    db.saveLocalVolunteerables(list);

    if (id !== "661135501226672129" && id !== "1410583272173600819") {
      try {
        const localUsers = db.loadLocalUsers();
        let updated = false;
        Object.keys(localUsers).forEach(key => {
          const u = localUsers[key];
          if (u.discordId === id || u.uid === `sim-discord-${id}`) {
            u.role = "Penonton Teater";
            updated = true;
          }
        });
        if (updated) db.saveLocalUsers(localUsers);
      } catch (e) {}
    }

    if (state.db) {
      try {
        await state.withTimeout(deleteDoc(doc(state.db, "volunteerables", id)));
        if (id !== "661135501226672129" && id !== "1410583272173600819") {
          const q = query(collection(state.db, "users"), where("discordId", "==", id));
          const querySnapshot = await state.withTimeout(getDocs(q));
          for (const userDoc of querySnapshot.docs) {
            await state.withTimeout(updateDoc(doc(state.db, "users", userDoc.id), { role: "Penonton Teater" }));
          }
        }
      } catch (e) {}
    }
    res.json({ success: true, list });
  });

  // POST Chat channels setup
  app.post('/api/chat/channels', requireClientToken, (req, res) => {
    const { channels } = req.body;
    if (!Array.isArray(channels)) return res.status(400).json({ error: "Channels must be an array" });
    db.saveActiveChannels(channels);
    res.json({ success: true, channels });
  });

  app.get('/api/chat/channels', async (req, res) => {
    const savedActive = db.loadActiveChannels();
    if (savedActive !== null) return res.json(savedActive);

    if (!state.isDiscordReady || !state.client || !GUILD_ID) {
      return res.json(state.chatChannels);
    }

    try {
      const guild = await state.client.guilds.fetch(GUILD_ID);
      if (!guild) return res.json(state.chatChannels);
      const channels = await guild.channels.fetch();

      const textChannels = channels
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ id: c.id, name: c.name, type: "text", desc: c.topic || `Saluran obrolan #${c.name}` }));

      const voiceChannels = channels
        .filter(c => c.type === ChannelType.GuildVoice)
        .map(c => ({ id: c.id, name: c.name, type: "voice", desc: `Obrolan Suara (Text-in-Voice) untuk saluran ${c.name} 🎙️` }));

      if (textChannels.length === 0) return res.json(state.chatChannels);
      const allChannels = [...textChannels.slice(0, 8), ...voiceChannels.slice(0, 4)];
      res.json(allChannels);
    } catch (err) {
      res.json(state.chatChannels);
    }
  });

  app.get('/api/chat/channels/:channelId', async (req, res) => {
    const { channelId } = req.params;
    if (!state.isDiscordReady || !state.client) {
      return res.status(404).json({ error: "Client Discord tidak aktif (Simulation Mode)" });
    }
    try {
      const channel = await state.client.channels.fetch(channelId);
      if (!channel) return res.status(404).json({ error: "Saluran tidak ditemukan" });
      res.json({ id: channel.id, name: channel.name, type: channel.type === ChannelType.GuildVoice ? "voice" : "text", desc: channel.topic || `Saluran obrolan #${channel.name}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chat/channels/:channelId/messages', async (req, res) => {
    const { channelId } = req.params;
    if (state.chatMessages[channelId]) {
      return res.json(state.chatMessages[channelId]);
    }

    if (!state.isDiscordReady || !state.client) {
      state.chatMessages[channelId] = [
        { id: "msg-init-" + Date.now(), content: `Selamat datang di saluran #${channelId}! Mulai obrolan seru di sini. ✨`, author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini", isBot: true }
      ];
      return res.json(state.chatMessages[channelId]);
    }

    try {
      const channel = await state.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return res.status(404).json({ error: "Saluran tidak ditemukan atau bukan saluran teks" });

      const messages = await channel.messages.fetch({ limit: 35 });
      const formatted = [];
      const guild = channel.guild;

      for (const [, msg] of messages) {
        const resolved = await helpers.resolveMentions(msg.content, guild);
        formatted.unshift({
          id: msg.id,
          content: resolved,
          author: msg.member?.displayName || msg.author.globalName || msg.author.username,
          authorAvatar: msg.author.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
          timestamp: `Hari Ini pukul ${msg.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
          isBot: msg.author.bot,
          attachments: msg.attachments.map(a => ({ id: a.id, url: a.url, contentType: a.contentType }))
        });
      }

      state.chatMessages[channelId] = formatted;
      db.saveChatMessages(state.chatMessages);
      res.json(formatted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/channels/:channelId/messages', requireClientToken, async (req, res) => {
    const { channelId } = req.params;
    const { content, author, authorAvatar, isBot, replyToMsgId } = req.body;

    if (!content) return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    if (!state.chatMessages[channelId]) state.chatMessages[channelId] = [];

    const timestamp = `Hari Ini pukul ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    const cleanContent = helpers.sanitizeString(content, 1000);

    const newMsg = {
      id: "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      content: cleanContent,
      author: author || "Pemain Teater",
      authorAvatar: authorAvatar || "https://api.dicebear.com/7.x/identicon/svg?seed=" + (author || "teater"),
      timestamp,
      isBot: !!isBot
    };

    state.chatMessages[channelId].push(newMsg);
    db.saveChatMessages(state.chatMessages);

    global.broadcastWsUpdate('chat', channelId);

    if (cleanContent.toLowerCase().includes('@sparxie') || cleanContent.toLowerCase().includes('sparxie')) {
      setTimeout(() => {
        const quote = state.sparxieQuotes[Math.floor(Math.random() * state.sparxieQuotes.length)];
        let replyPrefix = "";

        if (replyToMsgId) {
          const localRepliedMsg = state.chatMessages[channelId].find(m => m.id === replyToMsgId);
          if (localRepliedMsg) {
            replyPrefix = `*Membalas @${localRepliedMsg.author}:* "${localRepliedMsg.content.slice(0, 40)}..."\n\n`;
          }
        }

        const botMsg = {
          id: "msg-sparxie-" + Date.now(),
          content: `${replyPrefix}🤖 **Sparxie:** ${quote}`,
          author: "Sparxie Bot",
          authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie",
          timestamp: `Hari Ini pukul ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
          isBot: true
        };
        state.chatMessages[channelId].push(botMsg);
        db.saveChatMessages(state.chatMessages);

        global.broadcastWsUpdate('chat', channelId);

        if (state.isDiscordReady && state.client) {
          state.client.channels.fetch(channelId).then(chan => {
            if (chan && chan.isTextBased()) {
              chan.send(botMsg.content).catch(() => {});
            }
          }).catch(() => {});
        }
      }, 1500);
    }

    if (state.isDiscordReady && state.client) {
      try {
        const channel = await state.client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const sent = await channel.send(cleanContent);
          newMsg.id = sent.id;
          db.saveChatMessages(state.chatMessages);
        }
      } catch (e) {}
    }

    res.json(newMsg);
  });

  // OAuth redirect links
  app.get('/api/oauth/link', (req, res) => {
    const appId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const url = `https://discord.com/api/oauth2/authorize?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20role_connections.write%20sdk.social_layer`;
    res.redirect(url);
  });

  app.get('/api/oauth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("Kode otorisasi tidak ditemukan.");

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    try {
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${await tokenResponse.text()}`);
      const tokenData = await tokenResponse.json();

      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });

      if (!userResponse.ok) throw new Error("Gagal mengambil data user");
      const userData = await userResponse.json();

      const accounts = db.loadLinkedAccounts();
      accounts[userData.id] = {
        username: userData.username,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000)
      };
      db.saveLinkedAccounts(accounts);

      await updateConnectionMetadata(userData.id, userData.username, tokenData.access_token);

      res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 100px; background-color: #1a1a2e; color: #fff;">
            <h1 style="color: #43b581;">🎉 Otorisasi Berhasil!</h1>
            <p>Stats Widget teater Anda telah berhasil ditautkan dengan akun Discord <b>@${userData.username}</b>.</p>
            <p>Anda bisa menutup tab browser ini sekarang dan kembali ke teater Discord CrunchyVerse.</p>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`OAuth Error: ${err.message}`);
    }
  });

  // SUBMISSIONS MANAGEMENT
  app.post('/api/submissions/approve', requireClientToken, async (req, res) => {
    const { subId, approvedBy } = req.body;
    if (!subId) return res.status(400).json({ error: "subId wajib diisi" });

    const localSubs = db.loadLocalSubmissions();
    const subIndex = localSubs.findIndex(s => s.id === subId);
    if (subIndex === -1) return res.status(404).json({ error: "Submission tidak ditemukan" });

    const sub = localSubs[subIndex];
    if (sub.status !== 'pending') return res.status(400).json({ error: `Submission sudah diproses (${sub.status})` });

    sub.status = 'approved';
    db.saveLocalSubmissions(localSubs);

    if (state.db) {
      try {
        await updateDoc(doc(state.db, "submissions", subId), { status: "approved" });
      } catch (e) {}
    }

    if (sub.userId && sub.questId) {
      const decks = db.loadLocalDecks();
      if (decks[sub.userId]) {
        decks[sub.userId].statuses = decks[sub.userId].statuses || {};
        decks[sub.userId].statuses[sub.questId] = "Completed";
        db.saveLocalDecks(decks);
      }
      if (state.db) {
        try {
          const deckRef = doc(state.db, "user_decks", sub.userId);
          const deckDoc = await getDoc(deckRef);
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [sub.questId]: "Completed" };
            await updateDoc(deckRef, { statuses: updatedStatuses });
          }
        } catch (e) {}
      }
    }

    const points = sub.points || 0;
    try {
      const localUsers = db.loadLocalUsers();
      if (!localUsers[sub.userId]) {
        localUsers[sub.userId] = { uid: sub.userId, name: sub.username || "Pemain Teater", email: sub.userEmail || "", role: "Penonton Teater", cv: 0, points: 0 };
      }
      localUsers[sub.userId].cv = (localUsers[sub.userId].cv || 0) + points;
      localUsers[sub.userId].points = (localUsers[sub.userId].points || 0) + points;
      db.saveLocalUsers(localUsers);
    } catch (e) {}

    if (state.db) {
      try {
        const userRef = doc(state.db, "users", sub.userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const currentPoints = userDoc.data().cv || userDoc.data().points || 0;
          await updateDoc(userRef, { cv: currentPoints + points, points: currentPoints + points });
        } else {
          await setDoc(userRef, { uid: sub.userId, name: sub.username, email: sub.userEmail, role: "Penonton Teater", cv: points, points });
        }
      } catch (e) {}
    }

    if (state.client && state.isDiscordReady && GUILD_ID) {
      try {
        const guild = await state.client.guilds.fetch(GUILD_ID);
        let targetDiscordId = sub.discordId;
        if (!targetDiscordId && sub.userId) {
          const match = sub.userId.match(/\d{17,20}/);
          if (match) targetDiscordId = match[0];
        }

        if (targetDiscordId) {
          const member = await guild.members.fetch(targetDiscordId).catch(() => null);
          if (member) {
            if (sub.roleId) {
              await member.roles.add(sub.roleId).catch(() => {});
            }
            await discordUtil.updatePlayerProgressRoles(member, sub.userId);
          }
        }

        if (sub.discordMessageId) {
          const pendingChan = await state.client.channels.fetch('1512604646328504370').catch(() => null);
          if (pendingChan && pendingChan.isTextBased()) {
            const msg = await pendingChan.messages.fetch(sub.discordMessageId).catch(() => null);
            if (msg) {
              await msg.reply(`✅ **Bukti Disetujui via Web Dashboard oleh @${approvedBy || "Admin"}**! Poin **+${points}** telah ditambahkan ke akun **${sub.username}**.`);
            }
          }
        }
      } catch (err) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, submission: sub });
  });

  app.post('/api/submissions/reject', requireClientToken, async (req, res) => {
    const { subId, rejectedBy } = req.body;
    if (!subId) return res.status(400).json({ error: "subId wajib diisi" });

    const localSubs = db.loadLocalSubmissions();
    const subIndex = localSubs.findIndex(s => s.id === subId);
    if (subIndex === -1) return res.status(404).json({ error: "Submission tidak ditemukan" });

    const sub = localSubs[subIndex];
    if (sub.status !== 'pending') return res.status(400).json({ error: `Submission sudah diproses` });

    sub.status = 'rejected';
    db.saveLocalSubmissions(localSubs);

    if (state.db) {
      try {
        await deleteDoc(doc(state.db, "submissions", subId));
      } catch (e) {}
    }

    if (sub.userId && sub.questId) {
      const decks = db.loadLocalDecks();
      if (decks[sub.userId]) {
        decks[sub.userId].statuses = decks[sub.userId].statuses || {};
        decks[sub.userId].statuses[sub.questId] = "Denied";
        db.saveLocalDecks(decks);
      }
      if (state.db) {
        try {
          const deckRef = doc(state.db, "user_decks", sub.userId);
          const deckDoc = await getDoc(deckRef);
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [sub.questId]: "Denied" };
            await updateDoc(deckRef, { statuses: updatedStatuses });
          }
        } catch (e) {}
      }
    }

    if (state.client && state.isDiscordReady && sub.discordMessageId) {
      try {
        const pendingChan = await state.client.channels.fetch('1512604646328504370').catch(() => null);
        if (pendingChan && pendingChan.isTextBased()) {
          const msg = await pendingChan.messages.fetch(sub.discordMessageId).catch(() => null);
          if (msg) {
            await msg.reply(`❌ **Bukti Ditolak via Web Dashboard oleh @${rejectedBy || "Admin"}**! Data submission ditolak.`);
          }
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, submission: sub });
  });

  app.post('/api/submissions/submit', requireClientToken, async (req, res) => {
    const { id, userId, username, userEmail, discordId, questId, questName, roleId, points, screenshotUrl } = req.body;

    const newSub = {
      id: id || "sub-" + Date.now(),
      userId,
      username,
      userEmail: userEmail || "",
      discordId,
      questId,
      questName,
      roleId,
      points: Number(points) || 0,
      screenshotUrl,
      status: 'pending',
      createdAt: new Date().toISOString(),
      discordMessageId: null
    };

    const localSubs = db.loadLocalSubmissions();
    localSubs.push(newSub);
    db.saveLocalSubmissions(localSubs);

    if (state.db) {
      try {
        await setDoc(doc(state.db, "submissions", newSub.id), newSub);
      } catch (e) {}
    }

    if (userId && questId) {
      const decks = db.loadLocalDecks();
      if (decks[userId]) {
        decks[userId].statuses = decks[userId].statuses || {};
        decks[userId].statuses[questId] = "Review";
        db.saveLocalDecks(decks);
      }
      if (state.db) {
        try {
          const deckRef = doc(state.db, "user_decks", userId);
          const deckDoc = await getDoc(deckRef);
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [questId]: "Review" };
            await updateDoc(deckRef, { statuses: updatedStatuses });
          }
        } catch (e) {}
      }
    }

    if (state.client && state.isDiscordReady) {
      try {
        const reviewChan = await state.client.channels.fetch('1512604646328504370').catch(() => null);
        if (reviewChan && reviewChan.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle(`📝 Submission Quest CrunchyVerse`)
            .setDescription(`Pemain **${username}** baru saja mengirimkan bukti penyelesaian quest.`)
            .addFields(
              { name: "👤 Nama Pemain", value: `${username} (${userEmail})`, inline: true },
              { name: "🆔 Discord ID / Mention", value: discordId ? `<@${discordId}> (\`${discordId}\`)` : 'Tidak terhubung', inline: true },
              { name: "🪐 Quest", value: `${questName} (\`${questId}\`)`, inline: true },
              { name: "💰 Nilai Poin (CV$)", value: `+${points} CV$`, inline: true },
              { name: "🎭 Target Role", value: roleId ? `<@&${roleId}>` : 'Tidak ada role', inline: true },
              { name: "🕒 Waktu Kirim", value: new Date(newSub.createdAt).toLocaleString('id-ID'), inline: true }
            )
            .setColor('#3498DB')
            .setTimestamp();

          if (screenshotUrl) {
            embed.setImage(screenshotUrl);
          }

          const sentMessage = await reviewChan.send({ embeds: [embed] });
          newSub.discordMessageId = sentMessage.id;
          db.saveLocalSubmissions(localSubs);

          if (state.db) {
            try {
              await updateDoc(doc(state.db, "submissions", newSub.id), { discordMessageId: sentMessage.id });
            } catch (e) {}
          }

          await sentMessage.react('✅').catch(() => {});
          await sentMessage.react('❌').catch(() => {});
        }
      } catch (discordErr) {
        console.error("❌ Gagal mengirim embed submission ke Discord:", discordErr.message);
      }
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, submission: newSub });
  });

  app.get('/api/submissions', (req, res) => {
    res.json(db.loadLocalSubmissions());
  });

  app.post('/api/submissions/reset-specific', requireClientToken, async (req, res) => {
    const { userId, questId } = req.body;
    if (!userId || !questId) return res.status(400).json({ error: "userId dan questId wajib diisi" });

    let localSubs = db.loadLocalSubmissions();
    localSubs = localSubs.filter(s => !(s.userId === userId && s.questId === questId));
    db.saveLocalSubmissions(localSubs);

    const decks = db.loadLocalDecks();
    if (decks[userId] && decks[userId].statuses) {
      delete decks[userId].statuses[questId];
      db.saveLocalDecks(decks);
    }

    if (state.db) {
      try {
        const deckRef = doc(state.db, "user_decks", userId);
        const deckDoc = await getDoc(deckRef);
        if (deckDoc.exists()) {
          const deckData = deckDoc.data();
          if (deckData.statuses) {
            delete deckData.statuses[questId];
            await updateDoc(deckRef, { statuses: deckData.statuses });
          }
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true });
  });

  app.post('/api/submissions/reset-all', requireClientToken, async (req, res) => {
    db.saveLocalSubmissions([]);
    db.saveLocalDecks({});

    if (state.db) {
      try {
        const subsSnap = await getDocs(collection(state.db, "submissions"));
        for (const d of subsSnap.docs) {
          await deleteDoc(doc(state.db, "submissions", d.id));
        }
        const decksSnap = await getDocs(collection(state.db, "user_decks"));
        for (const d of decksSnap.docs) {
          await updateDoc(doc(state.db, "user_decks", d.id), { dealt: false, cards: [], statuses: {} });
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true });
  });

  // DECK CARD ENDPOINTS
  app.get('/api/decks/:uid', async (req, res) => {
    const { uid } = req.params;
    res.json(await db.getUserDeck(uid));
  });

  app.post('/api/decks/deal', requireClientToken, async (req, res) => {
    const { uid, cards } = req.body;
    if (!uid || !cards || !Array.isArray(cards)) {
      return res.status(400).json({ error: "Format request deal tidak valid." });
    }

    const decks = db.loadLocalDecks();
    const deckData = { uid, dealt: true, cards, statuses: {} };
    decks[uid] = deckData;
    db.saveLocalDecks(decks);

    if (state.db) {
      try {
        await setDoc(doc(state.db, "user_decks", uid), deckData);
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, deck: deckData });
  });

  app.post('/api/decks/update-status', requireClientToken, async (req, res) => {
    const { uid, cardId, status } = req.body;
    if (!uid || !cardId || !status) {
      return res.status(400).json({ error: "uid, cardId, dan status wajib diisi." });
    }

    const decks = db.loadLocalDecks();
    if (!decks[uid]) {
      decks[uid] = { uid, dealt: false, cards: [], statuses: {} };
    }
    decks[uid].statuses = decks[uid].statuses || {};
    decks[uid].statuses[cardId] = status;
    db.saveLocalDecks(decks);

    if (state.db) {
      try {
        const deckRef = doc(state.db, "user_decks", uid);
        const deckDoc = await getDoc(deckRef);
        if (deckDoc.exists()) {
          const statuses = deckDoc.data().statuses || {};
          statuses[cardId] = status;
          await updateDoc(deckRef, { statuses });
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, deck: decks[uid] });
  });

  // QUESTS
  app.get('/api/quests', (req, res) => {
    res.json(db.loadLocalQuests());
  });

  app.post('/api/quests', requireClientToken, async (req, res) => {
    const quest = req.body;
    if (!quest.id || !quest.name) return res.status(400).json({ error: "id dan name quest wajib diisi" });

    const quests = db.loadLocalQuests();
    const existingIdx = quests.findIndex(q => q.id === quest.id);
    if (existingIdx !== -1) {
      quests[existingIdx] = quest;
    } else {
      quests.push(quest);
    }
    db.saveLocalQuests(quests);

    if (state.db) {
      try {
        await setDoc(doc(state.db, "quests", quest.id), quest);
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, quests });
  });

  app.delete('/api/quests/:id', requireClientToken, async (req, res) => {
    const { id } = req.params;
    let quests = db.loadLocalQuests();
    quests = quests.filter(q => q.id !== id);
    db.saveLocalQuests(quests);

    if (state.db) {
      try {
        await deleteDoc(doc(state.db, "quests", id));
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, quests });
  });

  app.post('/api/quests/load-defaults', requireClientToken, async (req, res) => {
    const defaults = [
      { id: "quest-1", name: "Nobar Teater Perdana", desc: "Ikut nobar teater CrunchyVerse perdana bersama member lain.", points: 15, roleId: "1512601002392764426" },
      { id: "quest-2", name: "Anomaly Teraktif", desc: "Masuk peringkat 10 besar level keaktifan Cakey Bot.", points: 30, roleId: "1512601102392764427" }
    ];
    db.saveLocalQuests(defaults);

    if (state.db) {
      try {
        for (const q of defaults) {
          await setDoc(doc(state.db, "quests", q.id), q);
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, quests: defaults });
  });

  app.post('/api/quests/delete-all', requireClientToken, async (req, res) => {
    db.saveLocalQuests([]);

    if (state.db) {
      try {
        const snap = await getDocs(collection(state.db, "quests"));
        for (const d of snap.docs) {
          await deleteDoc(doc(state.db, "quests", d.id));
        }
      } catch (e) {}
    }

    global.broadcastWsUpdate('global');
    res.json({ success: true, quests: [] });
  });

  // SYNC OAUTH/WIDGET
  app.post('/api/oauth/update-stats/:id', async (req, res) => {
    const { id } = req.params;
    const accounts = db.loadLinkedAccounts();
    const acc = accounts[id];
    if (!acc) return res.status(404).json({ error: "User belum terhubung with OAuth2." });

    let token = acc.access_token;
    if (Date.now() > (acc.expires_at - 300000)) {
      token = await refreshAccessToken(id, acc.refresh_token);
    }

    if (token) {
      const success = await updateConnectionMetadata(id, acc.username, token);
      res.json({ success });
    } else {
      res.status(500).json({ error: "Gagal me-refresh token." });
    }
  });

  app.post('/api/widget/sync', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId wajib diisi.' });

    const plainId = userId.replace('sim-discord-', '');
    const accounts = db.loadLinkedAccounts();
    const acc = accounts[plainId];

    if (!acc) {
      return res.status(400).json({ error: 'User belum melakukan otorisasi.', message: 'Silakan lakukan otorisasi di Discord.' });
    }

    let token = acc.access_token;
    if (Date.now() >= (acc.expires_at || 0) - 60000) {
      const refreshed = await refreshAccessToken(plainId, acc.refresh_token);
      if (refreshed) token = refreshed;
      else return res.status(500).json({ error: 'Sesi kedaluwarsa.', message: 'Gagal refresh token.' });
    }

    const stats = await getUserStats(plainId);
    const metadataSuccess = await updateConnectionMetadata(plainId, acc.username, token);

    if (metadataSuccess) {
      res.json({ success: true, stats, message: 'Widget berhasil disinkronisasi!' });
    } else {
      res.status(500).json({ error: 'Gagal menyinkronisasikan metadata widget.', stats });
    }
  });

  // GET Voice AFK keepalive endpoint
  app.get('/api/voice-afk/keepalive', async (req, res) => {
    const savedCfg = db.loadVoiceAfkConfig();
    const status = {
      botOnline: state.isDiscordReady,
      voiceConnected: state.connectionState.isConnectedToVoice,
      guildId: state.connectionState.guildId || savedCfg?.guildId || null,
      channelId: state.connectionState.channelId || savedCfg?.channelId || null,
      action: 'none',
      timestamp: new Date().toISOString()
    };

    if (!state.isDiscordReady || !state.client) {
      status.action = 'skipped_bot_offline';
      return res.json({ ...status, message: 'Bot Discord offline. Tidak bisa reconnect.' });
    }

    if (state.connectionState.isConnectedToVoice) {
      status.action = 'already_connected';
      return res.json({ ...status, message: '✅ Voice 24/7 aktif. Tidak perlu reconnect.' });
    }

    if (savedCfg && savedCfg.isConnected && savedCfg.guildId && savedCfg.channelId) {
      try {
        voice.addVoiceAfkLog(`[Keepalive/CronJob] Reconnecting ke voice channel ${savedCfg.channelId}...`, 'warning');
        await voice.connectToVoiceChannel(savedCfg.guildId, savedCfg.channelId);
        status.action = 'reconnected';
        status.voiceConnected = true;
        return res.json({ ...status, message: `✅ [Keepalive] Berhasil reconnect ke voice channel ${savedCfg.channelId}!` });
      } catch (err) {
        status.action = 'reconnect_failed';
        return res.status(500).json({ ...status, message: `❌ [Keepalive] Gagal reconnect: ${err.message}` });
      }
    }

    status.action = 'no_config';
    return res.json({ ...status, message: 'Tidak ada konfigurasi voice tersimpan.' });
  });

  // Setup cron cycles
  setInterval(runMetadataSyncCycle, 900000);
  setTimeout(runMetadataSyncCycle, 15000);
  setInterval(tiktok.checkTikTokLiveStatus, 300000);
  setTimeout(tiktok.checkTikTokLiveStatus, 10000);
}

module.exports = {
  registerRoutes,
  requireClientToken,
  decodePayload
};
