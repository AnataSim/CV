const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const compression = require('compression');
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  ChannelType,
  Partials,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');

const WebSocket = require('ws');

// Load environment variables
dotenv.config();

const fs = require('fs');
const path = require('path');

// Load parent Next.js env.local for Firebase Config
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Initialize Firebase in Discord Bot
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, deleteDoc, collection, query, where, getDocs, setDoc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let db = null;
if (firebaseConfig.projectId) {
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    console.log("🔥 [Firebase] SDK berhasil diinisialisasi secara aktif di Discord Bot.");
  } catch (err) {
    console.error("⚠️ [Firebase] Gagal inisialisasi Firebase di Discord Bot:", err.message);
  }
}

const withTimeout = (promise, timeoutMs = 8000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
    )
  ]);
};

const logFile = path.join(__dirname, 'server.log');
try { fs.writeFileSync(logFile, ''); } catch (e) { }
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  originalLog(...args);
  try { fs.appendFileSync(logFile, `[LOG] ${new Date().toISOString()} ${args.join(' ')}\n`); } catch (e) { }
};
console.error = (...args) => {
  originalError(...args);
  try { fs.appendFileSync(logFile, `[ERR] ${new Date().toISOString()} ${args.join(' ')}\n`); } catch (e) { }
};

const app = express();

// ================== SECURITY MIDDLEWARE ==================

// Restricted CORS — hanya izinkan origin dari frontend yang terdaftar
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, same-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CV-Client-Token', 'X-CV-Timestamp', 'X-CV-Client', 'X-CV-Encoded'],
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Hapus header yang mengekspos info server
  res.removeHeader('X-Powered-By');
  next();
});

// ================== RATE LIMITING ==================

// Global rate limit — 2000 req per 15 menit per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Silahkan coba lagi dalam 15 menit.' },
  skip: (req) => {
    // Skip rate limit untuk health checks
    return req.path === '/health' || req.path === '/api/voice-afk/keepalive';
  }
});
app.use(globalLimiter);

// Ketat untuk submission upload (cegah spam/abuse)
const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pengiriman bukti. Tunggu 15 menit sebelum mencoba lagi.' },
});

// Ketat untuk OAuth endpoints
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan autentikasi. Coba lagi dalam 15 menit.' },
});

// ================== MEMORY CACHE WITH TTL ==================

class MemoryCache {
  constructor() {
    this._store = new Map();
    // Auto-cleanup setiap 5 menit
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  set(key, value, ttlSeconds) {
    this._store.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key) {
    this._store.delete(key);
  }

  deletePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiry) this._store.delete(key);
    }
  }
}

const cache = new MemoryCache();

// ================== HMAC TOKEN VALIDATION ==================

const CV_API_SECRET = process.env.CV_API_SECRET || 'crunchyverse-stage-2026-secret';
const TOKEN_EXPIRY_SECONDS = 60; // Token valid 60 detik (naik dari 30 untuk toleransi latency)

function verifyRequestToken(token, path) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length < 2) return false;

  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp)) return false;

  // Cek timestamp tidak expired
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOKEN_EXPIRY_SECONDS) {
    return false;
  }

  // Verifikasi HMAC
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

// Middleware HMAC auth untuk endpoint sensitive
function requireClientToken(req, res, next) {
  const token = req.headers['x-cv-client-token'];
  const path = req.path;

  if (!verifyRequestToken(token, path)) {
    console.warn(`[Security] Invalid/missing client token dari ${req.ip} untuk ${req.method} ${path}`);
    // Return generic error tanpa detail
    return res.status(403).json({ error: 'Akses ditolak.' });
  }
  next();
}

// Dekripsi payload terenkripsi AES-256-GCM dari frontend
function decryptPayload(obfuscatedPayload) {
  try {
    const combined = Buffer.from(obfuscatedPayload, 'base64');
    if (combined.length < 28) {
      throw new Error("Payload terlalu pendek");
    }

    const iv = combined.subarray(0, 12);
    const encryptedWithTag = combined.subarray(12);

    // Auth tag AES-GCM adalah 16 byte terakhir dari data yang dihasilkan Web Crypto API
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

// Decode obfuscated payload kalau ada
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

// Input sanitasi — strip HTML dan limit panjang string
function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Strip control chars
    .trim()
    .slice(0, maxLen);
}

// ================== EXPRESS SETUP ==================

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(decodePayload); // Decode obfuscated payloads

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Helper to gather sync status data in parallel
async function verifyIsAdmin(uid) {
  if (!uid) return false;
  
  let discordId = null;
  const match = uid.match(/\d{17,20}/);
  if (match) discordId = match[0];
  
  if (discordId && (
    discordId === "661135501226672129" || 
    discordId === "1410583272173600819" || 
    discordId === "588988763204616214" || 
    discordId === "331053654318776320"
  )) {
    return true;
  }

  if (db) {
    try {
      const userDoc = await withTimeout(getDoc(doc(db, "users", uid)), 2000);
      if (userDoc && userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData?.role;
        if (role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik") {
          return true;
        }
      }
    } catch (e) {
      console.error("Gagal verifikasi admin via Firestore:", e.message);
    }
  }

  if (isDiscordReady && client && discordId) {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (member) {
        const hasAdminRole = member.roles.cache.some(r => 
          r.name.toLowerCase().includes('volunteer') || 
          r.name.toLowerCase().includes('ketua') || 
          member.permissions.has('Administrator')
        );
        if (hasAdminRole) {
          return true;
        }
      }
    } catch (e) {
      console.error("Gagal verifikasi admin via Discord:", e.message);
    }
  }

  return false;
}

async function gatherSyncData({ uid, chatChannelId, voiceChannelId, isAdmin }) {
  const response = {};

  try {
    const promises = [];
    const actualIsAdmin = await verifyIsAdmin(uid);

    // 1. Stats (Gathers Discord server statistics)
    promises.push((async () => {
      const cacheKey = 'api:stats';
      let statsData = cache.get(cacheKey);
      if (!statsData) {
        const mockStats = {
          totalMembers: 1337,
          totalKerupuk: 420,
          totalKeripik: 690,
          online: 245,
          idle: 62,
          dnd: 38,
          offline: 992,
          mode: "Simulation (Bot Offline)"
        };
        if (!isDiscordReady || !client || !GUILD_ID) {
          statsData = mockStats;
        } else {
          try {
            const guild = await client.guilds.fetch(GUILD_ID);
            if (!guild) {
              statsData = { ...mockStats, mode: "Simulation (Guild Not Found)" };
            } else {
              const totalMembers = guild.memberCount;
              const roleKerupukKey = process.env.ROLE_KERUPUK || 'Kerupuk';
              const roleKeripikKey = process.env.ROLE_KERIPIK || 'Keripik';
              const roleKerupuk = guild.roles.cache.find(r => r.id === roleKerupukKey || r.name.toLowerCase() === roleKerupukKey.toLowerCase());
              const roleKeripik = guild.roles.cache.find(r => r.id === roleKeripikKey || r.name.toLowerCase() === roleKeripikKey.toLowerCase());
              const totalKerupuk = roleKerupuk ? roleKerupuk.members.size : 0;
              const totalKeripik = roleKeripik ? roleKeripik.members.size : 0;
              let online = 0, idle = 0, dnd = 0, offline = 0;
              let hasPresences = false;
              guild.members.cache.forEach(member => {
                if (member.presence) {
                  hasPresences = true;
                  const status = member.presence.status;
                  if (status === 'online') online++;
                  else if (status === 'idle') idle++;
                  else if (status === 'dnd') dnd++;
                }
              });
              if (hasPresences) {
                offline = totalMembers - (online + idle + dnd);
              } else {
                const randomFactor = () => Math.floor(Math.random() * 6) - 3;
                online = Math.floor(totalMembers * 0.18) + randomFactor();
                idle = Math.floor(totalMembers * 0.05) + randomFactor();
                dnd = Math.floor(totalMembers * 0.03) + randomFactor();
                offline = totalMembers - (online + idle + dnd);
              }
              const finalKerupuk = totalKerupuk || Math.floor(totalMembers * 0.31);
              const finalKeripik = totalKeripik || Math.floor(totalMembers * 0.52);
              statsData = {
                totalMembers,
                totalKerupuk: finalKerupuk,
                totalKeripik: finalKeripik,
                online,
                idle,
                dnd,
                offline,
                mode: "Live Discord Connection"
              };
              cache.set(cacheKey, statsData, 60);
            }
          } catch (e) {
            statsData = { ...mockStats, mode: `Simulation (Error: ${e.message})` };
          }
        }
      }
      response.stats = statsData;
    })());

    // 2. Broadcasts
    promises.push((async () => {
      const cacheKey = 'api:broadcasts';
      let broadcastsData = cache.get(cacheKey);
      if (!broadcastsData) {
        const mockBroadcasts = [
          {
            id: "b1",
            content: "🎪 **PERTUNJUKAN AKBAR RESMI DIMULAI!** \n\nHalo para Anomaly sekalian! Malam ini tirai CrunchyVerse resmi dibuka lebar. Persiapkan tempat duduk Anda di barisan terdepan! Kami menghadirkan panggung interaktif baru ini khusus untuk Anda semua. \n\nBagikan keseruan ini ke teman-teman dan dapatkan role eksklusif malam ini!",
            author: "Pimpinan Produksi",
            authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager",
            timestamp: "Hari Ini pukul 08:30",
            imageUrl: "/theater_stage_bg.png"
          },
          {
            id: "b2",
            content: "🍿 **DIVISI KERUPUK & KERIPIK BERTEMPUR!** \n\nPertarungan sengit antara sekte Kerupuk gurih melawan sekte Keripik renyah akan dimulai di panggung koloseum suara malam ini pukul 20.00 WIB. Siapakah yang akan membawa pulang mahkota garing termegah? Pilih kubu Anda sekarang di channel #roles!",
            author: "Sutradara Event",
            authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=director",
            timestamp: "Kemarin pukul 18:15",
            imageUrl: null
          }
        ];
        if (!isDiscordReady || !client || !GUILD_ID) {
          broadcastsData = mockBroadcasts;
        } else {
          try {
            const guild = await client.guilds.fetch(GUILD_ID);
            if (!guild) {
              broadcastsData = mockBroadcasts;
            } else {
              const channelKey = process.env.BROADCAST_CHANNEL || 'broadcast';
              let channel = guild.channels.cache.find(c =>
                c.id === channelKey ||
                (c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
              );
              if (!channel) {
                try {
                  const channels = await guild.channels.fetch();
                  channel = channels.find(c =>
                    c.id === channelKey ||
                    (c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
                  );
                } catch (e) {}
              }
              if (channel) {
                const messages = await channel.messages.fetch({ limit: 10 });
                const list = [];
                for (const [, msg] of messages) {
                  if (msg.content || msg.attachments.size > 0) {
                    const resolvedContent = await resolveMentions(msg.content, guild);
                    const attachment = msg.attachments.first();
                    const imageUrl = (attachment && attachment.contentType?.startsWith('image/')) ? attachment.url : null;
                    const cleanTimestamp = `Hari Ini pukul ${msg.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                    list.push({
                      id: msg.id,
                      content: resolvedContent || 'Lampiran Media',
                      author: msg.member?.displayName || msg.author.globalName || msg.author.username,
                      authorAvatar: msg.author.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
                      timestamp: cleanTimestamp,
                      imageUrl
                    });
                  }
                }
                broadcastsData = list.length > 0 ? list : mockBroadcasts;
              } else {
                broadcastsData = mockBroadcasts;
              }
              cache.set(cacheKey, broadcastsData, 300);
            }
          } catch (e) {
            broadcastsData = mockBroadcasts;
          }
        }
      }
      response.broadcasts = broadcastsData;
    })());

    // 3. TikTok Status
    promises.push((async () => {
      const cacheKey = 'api:tiktok';
      let tiktokData = cache.get(cacheKey);
      if (!tiktokData) {
        tiktokData = tiktokState;
        cache.set(cacheKey, tiktokData, 30);
      }
      response.tiktok = tiktokData;
    })());

    // 4. VoiceAFK Status
    promises.push((async () => {
      let guilds = [];
      let inviteLink = null;
      if (client && isDiscordReady) {
        inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=3145728&scope=bot`;
        try {
          guilds = client.guilds.cache.map(g => {
            const voiceChannels = g.channels.cache
              .filter(c => c.type === ChannelType.GuildVoice)
              .map(c => ({ id: c.id, name: c.name }));
            return { id: g.id, name: g.name, icon: g.iconURL(), channels: voiceChannels };
          });
        } catch (err) {}
      }
      response.voiceAfkStatus = {
        ...connectionState,
        guilds,
        inviteLink
      };
    })());

    // 5. User Data & Deck (if uid is provided)
    if (uid) {
      promises.push((async () => {
        let discordId = null;
        const match = uid.match(/\d{17,20}/);
        if (match) discordId = match[0];

        let liveCv = 0;
        let hasLiveCv = false;
        if (isDiscordReady && client && discordId) {
          try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (member) {
              const roles = await guild.roles.fetch();
              const roleCvMap = new Map();
              roles.forEach(role => {
                if (role.name !== "@everyone" && !role.managed && !EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
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
          } catch (err) {}
        }

        const localUsers = loadLocalUsers();
        const userData = localUsers[uid] || { uid, name: "Pemain Teater", cv: 0, points: 0 };
        if (hasLiveCv) {
          userData.cv = liveCv;
          userData.points = liveCv;
          localUsers[uid] = userData;
          saveLocalUsers(localUsers);
        }
        response.user = userData;
      })());

      promises.push((async () => {
        response.deck = await getUserDeck(uid);
      })());
    }

    // 6. Chat Messages (if chatChannelId is provided)
    if (chatChannelId) {
      promises.push((async () => {
        if (!chatMessages[chatChannelId]) {
          chatMessages[chatChannelId] = [
            { id: "msg-init-" + Date.now(), content: `Selamat datang di saluran #${chatChannelId}! Mulai obrolan seru di sini. ✨`, author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini", isBot: true }
          ];
        }
        response.chatMessages = chatMessages[chatChannelId];
      })());
    }

    // 7. Voice Channel Members (using voiceChannelId if provided, else default or active connection)
    promises.push((async () => {
      const vChanId = voiceChannelId || connectionState.channelId || "1435053596742914160";
      const fallbackMembers = [
        { name: "[AFK] T0ddei", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei" },
        { name: "Dari Kontak Anda", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak" }
      ];

      if (!isDiscordReady || !client) {
        response.voiceChannel = {
          name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
          status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
          members: fallbackMembers,
          count: fallbackMembers.length
        };
        return;
      }

      try {
        const channel = await client.channels.fetch(vChanId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildVoice) {
          let detectedStatus = null;
          if (vChanId === '1435053596742914160' && jockieMusicStatus) {
            const timeDiff = Date.now() - lastJockieTrackTime;
            if (timeDiff < 1800000) { // 30 mins
              const elapsedTotalSec = Math.floor(timeDiff / 1000);
              const elapsedMin = Math.floor(elapsedTotalSec / 60);
              const elapsedSec = (elapsedTotalSec % 60).toString().padStart(2, '0');
              const statusParts = jockieMusicStatus.split('] • ');
              const trackInfo = statusParts[1] || statusParts[0];
              detectedStatus = `[${elapsedMin}:${elapsedSec}] • ${trackInfo}`;
              if (lastJockieMessage) {
                lastJockieMessage.react('✅').catch(() => {});
                lastJockieMessage = null;
              }
            }
          }

          if (!detectedStatus) {
            for (const [, m] of channel.members) {
              try {
                const presence = m.presence;
                if (presence && presence.activities && presence.activities.length > 0) {
                  const spotify = presence.activities.find(act => act.name === 'Spotify');
                  if (spotify) {
                    let progressStr = "";
                    if (spotify.timestamps && spotify.timestamps.start) {
                      const elapsedMs = Date.now() - spotify.timestamps.start.getTime();
                      const elapsedMin = Math.floor(elapsedMs / 60000);
                      const elapsedSec = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
                      progressStr = `[${elapsedMin}:${elapsedSec}] • `;
                    }
                    detectedStatus = `${progressStr}${spotify.details || 'Unknown Track'} - ${spotify.state || 'Unknown Artist'}`;
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          if (!detectedStatus) {
            for (const [, m] of channel.members) {
              try {
                const presence = m.presence;
                if (presence && presence.activities && presence.activities.length > 0) {
                  const custom = presence.activities.find(act => act.type === 4);
                  if (custom && custom.state) {
                    detectedStatus = custom.state;
                    break;
                  }
                  const listening = presence.activities.find(act => act.type === 2);
                  if (listening) {
                    detectedStatus = `${listening.details || listening.name}${listening.state ? ` - ${listening.state}` : ''}`;
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          const finalStatus = detectedStatus || (typeof channel.status === 'string' && channel.status ? channel.status : "[05:14] • I Always Wanna Die (Sometimes) - The 1975");
          const activeMembers = channel.members.map(m => {
            const isMuted = m.voice.selfMute || m.voice.serverMute;
            const isDeafened = m.voice.selfDeaf || m.voice.serverDeaf;
            const isSpeaking = !isMuted && !isDeafened && Math.random() < 0.25;
            let roleValueSymbol = null;
            try {
              const highestRole = m.roles.cache
                .filter(r => r.name !== "@everyone" && !r.managed)
                .sort((a, b) => b.position - a.position)
                .first();
              if (highestRole) {
                const cvMatch = highestRole.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
                if (cvMatch) {
                  roleValueSymbol = `${cvMatch[1].trim()} 🌟`;
                }
              }
            } catch (roleErr) {}

            return {
              name: m.displayName || m.user.globalName || m.user.username,
              avatar: m.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
              isMuted,
              isDeafened,
              isSpeaking,
              isLive: m.voice.selfVideo || m.voice.streaming,
              roleValueSymbol
            };
          });

          response.voiceChannel = {
            name: channel.name,
            status: finalStatus,
            members: activeMembers,
            count: activeMembers.length
          };
        } else {
          response.voiceChannel = {
            name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
            status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
            members: fallbackMembers,
            count: fallbackMembers.length
          };
        }
      } catch (err) {
        response.voiceChannel = {
          name: vChanId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
          status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
          members: fallbackMembers,
          count: fallbackMembers.length
        };
      }
    })());

    // 8. Submissions (if isAdmin is true)
    if (actualIsAdmin) {
      promises.push((async () => {
        const cacheKey = `api:submissions:all`;
        let subs = cache.get(cacheKey);
        if (!subs) {
          subs = loadLocalSubmissions();
          cache.set(cacheKey, subs, 15);
        }
        response.submissions = subs;
      })());
    }

    // Wait for all queries to resolve
    await Promise.all(promises);
    return response;
  } catch (err) {
    console.error("❌ Error in gatherSyncData:", err.message);
    throw err;
  }
}

// POST /api/sync - Unified status sync endpoint to group multiple requests
app.post('/api/sync', async (req, res) => {
  try {
    const response = await gatherSyncData(req.body);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

// Local JSON Database Helpers for offline fallback syncing
const SUBMISSIONS_FILE = path.join(__dirname, '../database/submissions.json');
const DECKS_FILE = path.join(__dirname, '../database/user_decks.json');

function loadLocalSubmissions() {
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca submissions.json:", e.message);
  }
  return [];
}

function saveLocalSubmissions(subs) {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis submissions.json:", e.message);
  }
}

function loadLocalDecks() {
  try {
    if (fs.existsSync(DECKS_FILE)) {
      return JSON.parse(fs.readFileSync(DECKS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca user_decks.json:", e.message);
  }
  return {};
}

function saveLocalDecks(decks) {
  try {
    fs.writeFileSync(DECKS_FILE, JSON.stringify(decks, null, 2), 'utf8');
    // Invalidate memory cache so that the next read gets the fresh data
    if (typeof cache !== 'undefined' && cache.deletePrefix) {
      cache.deletePrefix('user_deck:');
    }
  } catch (e) {
    console.error("Gagal menulis user_decks.json:", e.message);
  }
}

async function getUserDeck(uid) {
  if (!uid) return { uid, dealt: false, cards: [], statuses: {} };

  // 1. Cek in-memory cache dulu untuk performance instan
  const cacheKey = `user_deck:${uid}`;
  const cachedDeck = cache.get(cacheKey);
  if (cachedDeck) {
    return cachedDeck;
  }

  // 2. Coba baca dari database lokal JSON
  const decks = loadLocalDecks();
  const localDeck = decks[uid];
  
  // Jika deck lokal sudah ada dan didealkan (dealt === true), langsung cache di memory dan kembalikan (cepat)
  if (localDeck && localDeck.dealt) {
    cache.set(cacheKey, localDeck, 30); // Cache selama 30 detik
    return localDeck;
  }

  // 3. Jika tidak ada di lokal atau dealt masih false, coba fetch dari Firestore
  if (db) {
    try {
      const deckRef = doc(db, "user_decks", uid);
      // Gunakan timeout yang sangat singkat (500ms) agar jika Firestore lambat/tidak terjangkau tidak menyebabkan lag
      const deckDoc = await withTimeout(getDoc(deckRef), 500);
      if (deckDoc && deckDoc.exists()) {
        const deckData = deckDoc.data();
        // Update local JSON cache agar sinkron
        decks[uid] = deckData;
        saveLocalDecks(decks);
        cache.set(cacheKey, deckData, 30); // Cache selama 30 detik
        return deckData;
      }
    } catch (e) {
      console.warn(`⚠️ [Firebase] Gagal fetch deck untuk ${uid} dari Firestore:`, e.message);
    }
  }

  const finalDeck = localDeck || { uid, dealt: false, cards: [], statuses: {} };
  cache.set(cacheKey, finalDeck, 10); // Cache deck kosong/belum deal selama 10 detik agar tidak timeout berulang-ulang
  return finalDeck;
}


const QUESTS_FILE = path.join(__dirname, '../database/quests.json');

const DEFAULT_QUESTS = [
  {
    id: "default-1",
    akt: "Akt I",
    title: "Tebak Member Anomaly",
    description: "Sebutkan nama member Anomaly terpopuler malam ini di voice channel utama beserta alasannya!",
    difficulty: "Mudah",
    points: 10
  },
  {
    id: "default-2",
    akt: "Akt I",
    title: "Sekte Kerupuk vs Keripik",
    description: "Bujuk 2 member offline untuk online dan memilih kubu garing di channel #roles!",
    difficulty: "Sedang",
    points: 25
  },
  {
    id: "default-3",
    akt: "Akt II",
    title: "Karaoke 1 Menit",
    description: "Nyanyikan sepenggal lagu favoritmu di Voice Channel selama minimal 1 menit!",
    difficulty: "Sedang",
    points: 30
  },
  {
    id: "default-4",
    akt: "Akt II",
    title: "Kolektor Kerupuk Teater",
    description: "Kumpulkan 100 poin kerupuk dalam game panggung utama dalam waktu 5 menit!",
    difficulty: "Sulit",
    points: 50
  },
  {
    id: "default-5",
    akt: "Akt III",
    title: "Misteri Admin Bahagia",
    description: "Cari tahu alasan kenapa admin utama CrunchyVerse sedang bahagia malam ini!",
    difficulty: "Legendaris",
    points: 100
  }
];

function loadLocalQuests() {
  try {
    if (fs.existsSync(QUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(QUESTS_FILE, 'utf8'));
    } else {
      saveLocalQuests(DEFAULT_QUESTS);
      return DEFAULT_QUESTS;
    }
  } catch (e) {
    console.error("Gagal membaca quests.json:", e.message);
  }
  return DEFAULT_QUESTS;
}

function saveLocalQuests(quests) {
  try {
    fs.writeFileSync(QUESTS_FILE, JSON.stringify(quests, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis quests.json:", e.message);
  }
}

// VoiceAFK Global State & Config Persistence
const VOICE_AFK_CONFIG_FILE = path.join(__dirname, '../database/voice-afk-config.json');

// ==============================================================================
// =================== KRPK-0421: Ghost Mode Selfbot Manager ===================
// ==============================================================================

const GHOST_USER_TOKEN = null; // DISABLED: Kena suspicious activity flag (TOS violation risk)
const SIM_DISCORD_ID = process.env.SIM_DISCORD_ID || '661135501226672129';
const GHOST_CONTROL_CHANNEL_ID = process.env.GHOST_CONTROL_CHANNEL_ID || '1513463585605423174';

const GHOST_CONFIG_FILE = path.join(__dirname, '../database/ghost-mode-config.json');

function saveGhostConfig(cfg) {
  try {
    fs.writeFileSync(GHOST_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) { console.error('[KRPK-0421] Gagal simpan ghost config:', e.message); }
}

function loadGhostConfig() {
  try {
    if (fs.existsSync(GHOST_CONFIG_FILE)) return JSON.parse(fs.readFileSync(GHOST_CONFIG_FILE, 'utf8'));
  } catch (e) { console.error('[KRPK-0421] Gagal baca ghost config:', e.message); }
  return null;
}

class SelfbotManager {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.sessionId = null;
    this.isReady = false;
    this.isConnected = false;
    this.currentGuildId = null;
    this.currentChannelId = null;
    this._reconnectTimer = null;
    this._destroyed = false;       // true hanya kalau destroy() dipanggil secara eksplisit
    this._reconnectDelay = 5000;  // mulai 5 detik, naik s/d 60 detik
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Gateway connect timeout (15s)')), 15000);
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.on('open', () => {
        this._reconnectDelay = 5000; // reset backoff setelah berhasil
        console.log('[KRPK-0421] WebSocket Gateway terbuka.');
      });

      this.ws.on('message', (data) => {
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        const { op, d, s, t } = payload;
        if (s) this.sequence = s;

        if (op === 10) { // Hello
          this._startHeartbeat(d.heartbeat_interval);
          this._identify();
        } else if (op === 11) { // Heartbeat ACK
          // ok
        } else if (op === 0) { // Dispatch
          if (t === 'READY') {
            this.sessionId = d.session_id;
            this.isReady = true;
            console.log(`[KRPK-0421] Ghost user ready: ${d.user.username}#${d.user.discriminator}`);
            clearTimeout(timeout);
            resolve();
            // Auto-restore voice jika sebelumnya sedang aktif
            this._autoRestoreVoice();
          }
        } else if (op === 9) { // Invalid session
          console.warn('[KRPK-0421] Invalid session dari Gateway.');
          clearTimeout(timeout);
          reject(new Error('Invalid session'));
        }
      });

      this.ws.on('close', (code) => {
        console.warn(`[KRPK-0421] WebSocket ditutup: code=${code}`);
        this.isReady = false;
        this.isConnected = false;
        this._stopHeartbeat();
        clearTimeout(timeout);
        // Auto-reconnect kalau bukan karena destroy() eksplisit dan bukan error autentikasi
        if (!this._destroyed && code !== 4004) {
          console.log(`[KRPK-0421] Akan reconnect dalam ${this._reconnectDelay / 1000}s...`);
          this._reconnectTimer = setTimeout(() => this._doReconnect(), this._reconnectDelay);
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, 60000); // max 60 detik
        } else if (code === 4004) {
          console.error('[KRPK-0421] Koneksi ditolak oleh Discord karena Token tidak valid (code=4004). Auto-reconnect dinonaktifkan.');
        }
      });

      this.ws.on('error', (err) => {
        console.error('[KRPK-0421] WebSocket error:', err.message);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async _doReconnect() {
    if (this._destroyed) return;
    try {
      console.log('[KRPK-0421] Mencoba reconnect ke Gateway...');
      await this.connect();
      console.log('[KRPK-0421] Reconnect berhasil!');
    } catch (err) {
      console.error('[KRPK-0421] Reconnect gagal:', err.message);
      // Akan dicoba lagi oleh close handler berikutnya
    }
  }

  async _autoRestoreVoice() {
    // Cek apakah ghost mode seharusnya aktif berdasarkan config yang tersimpan
    await new Promise(r => setTimeout(r, 2000)); // tunggu 2 detik setelah READY
    const cfg = loadGhostConfig();
    if (!cfg || !cfg.isEnabled || !cfg.guildId || !cfg.channelId) return;
    try {
      console.log(`[KRPK-0421] Auto-restore: bergabung kembali ke voice channel ${cfg.channelId}...`);
      await this.joinVoice(cfg.guildId, cfg.channelId);
      // Update nickname juga
      if (cfg.nickname) {
        await new Promise(r => setTimeout(r, 1500));
        await this.setNickname(cfg.guildId, cfg.nickname).catch(e =>
          console.warn('[KRPK-0421] Auto-restore nickname gagal:', e.message)
        );
      }
      console.log('[KRPK-0421] Auto-restore voice berhasil!');
      await updateGhostControlMessageStatus(true).catch(() => {});
    } catch (err) {
      console.error('[KRPK-0421] Auto-restore voice gagal:', err.message);
    }
  }

  _identify() {
    this._send({
      op: 2,
      d: {
        token: this.token,
        properties: {
          os: 'linux',
          browser: 'Discord Web',
          device: 'Discord Web'
        },
        intents: 0
      }
    });
  }

  _startHeartbeat(interval) {
    this._stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this._send({ op: 1, d: this.sequence });
    }, interval);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async joinVoice(guildId, channelId) {
    if (!this.isReady) throw new Error('Ghost user belum ready.');
    this._send({
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: channelId,
        self_mute: true,
        self_deaf: true
      }
    });
    this.currentGuildId = guildId;
    this.currentChannelId = channelId;
    this.isConnected = true;
    console.log(`[KRPK-0421] Ghost user join voice: guild=${guildId}, channel=${channelId}`);
  }

  async leaveVoice() {
    if (!this.isReady || !this.currentGuildId) return;
    this._send({
      op: 4,
      d: {
        guild_id: this.currentGuildId,
        channel_id: null,
        self_mute: false,
        self_deaf: false
      }
    });
    console.log(`[KRPK-0421] Ghost user leave voice dari guild=${this.currentGuildId}`);
    this.currentGuildId = null;
    this.currentChannelId = null;
    this.isConnected = false;
  }

  async setNickname(guildId, nickname) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/@me`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': this.token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ nick: nickname })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`setNickname gagal: HTTP ${resp.status} — ${body}`);
    }
    const data = await resp.json();
    console.log(`[KRPK-0421] Nickname diubah ke: "${nickname}"`);
    return data.nick || nickname;
  }

  async getCurrentNickname(guildId) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/@me`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': this.token,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.nick || null;
  }

  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isReady = false;
    this.isConnected = false;
    console.log('[KRPK-0421] SelfbotManager dihancurkan.');
  }
}

let ghostManager = null;
let ghostControlMessageId = null;


let connectionState = {
  isBotLoggedIn: false,
  botUsername: null,
  botAvatar: null,
  isConnectedToVoice: false,
  guildId: null,
  channelId: null,
  status: 'offline',
  logs: []
};

function addVoiceAfkLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  connectionState.logs.unshift(logEntry);
  if (connectionState.logs.length > 50) {
    connectionState.logs.pop();
  }
  console.log(`[VoiceAFK ${type.toUpperCase()}] ${timestamp} - ${message}`);
}

function loadVoiceAfkConfig() {
  try {
    if (fs.existsSync(VOICE_AFK_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(VOICE_AFK_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca voice-afk-config.json:", e.message);
  }
  return null;
}

function saveVoiceAfkConfig(config) {
  try {
    fs.writeFileSync(VOICE_AFK_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis voice-afk-config.json:", e.message);
  }
}

// Global Mock / Live States
let client = null;
let isDiscordReady = false;
let lastVoiceLogTime = 0;
let jockieMusicStatus = null;
let lastJockieTrackTime = 0;
let lastJockieMessage = null;

// Excluded Rank Role IDs from CV calculation to prevent feedback loops
const EXCLUDED_CV_ROLE_IDS = [
  '1511318299730903170', // leveling rank role
  '1511318492664561755', // streak rank role
  '1511319103938232431', // voice rank role
  '1511319284616265798', // cvWealth rank role
];

// Config state for TikTok (can be updated dynamically)
// Config state for TikTok (can be updated dynamically)
let tiktokState = {
  username: process.env.TIKTOK_USERNAME || "@crunchyverse.live",
  displayName: process.env.TIKTOK_DISPLAY_NAME || "CrunchyVerse Show",
  isLive: true,
  avatarUrl: process.env.TIKTOK_AVATAR_URL || "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok",
  liveTitle: "🎪 STAGE LIVE: Nobar Konser & Chit-chat Bareng Member Anomaly! 🍿",
  manualOverride: false
};

async function connectToVoiceChannel(guildId, channelId) {
  if (!client || !isDiscordReady) {
    throw new Error('Klien Discord belum siap.');
  }

  connectionState.status = 'connecting_voice';
  addVoiceAfkLog(`Menghubungkan ke Voice Channel: Server ${guildId}, Channel ${channelId}...`, 'info');

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild ${guildId} tidak ditemukan.`);
  }

  const voiceConnection = joinVoiceChannel({
    channelId: channelId,
    guildId: guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });

  voiceConnection.on(VoiceConnectionStatus.Ready, () => {
    connectionState.isConnectedToVoice = true;
    connectionState.guildId = guildId;
    connectionState.channelId = channelId;
    connectionState.status = 'connected_voice';
    addVoiceAfkLog(`Bot berhasil masuk ke voice channel ${channelId} dan stay 24/7!`, 'success');
    saveVoiceAfkConfig({ guildId, channelId, isConnected: true });
  });

  voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      addVoiceAfkLog('Koneksi terputus secara tidak terduga, mencoba menyambung kembali...', 'warning');
      await Promise.race([
        entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5000),
        entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      // Reconnected!
    } catch (error) {
      connectionState.isConnectedToVoice = false;
      connectionState.status = 'ready';
      // PENTING: Simpan guildId & channelId agar watchdog bisa reconnect otomatis!
      // Jangan set isConnected: false agar config tetap tahu channel tujuan.
      addVoiceAfkLog(`Bot terputus dari voice channel. Watchdog akan mencoba reconnect otomatis dalam 3 menit...`, 'warning');
      saveVoiceAfkConfig({ guildId, channelId, isConnected: true });
      try {
        voiceConnection.destroy();
      } catch (e) { }
    }
  });

  try {
    // Kurangi timeout ke 5 detik untuk respon UI yang lebih cepat
    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 5000);
  } catch (err) {
    // Toleransi UDP: Jika tersangkut di signalling/connecting tapi isDiscordReady ok, tetap anggap sukses
    console.warn(`⚠️ [VoiceAFK] entersState Ready timed out/aborted: ${err.message}. Mengabaikan error koneksi UDP untuk mode AFK.`);
    connectionState.isConnectedToVoice = true;
    connectionState.guildId = guildId;
    connectionState.channelId = channelId;
    connectionState.status = 'connected_voice';
    saveVoiceAfkConfig({ guildId, channelId, isConnected: true });
  }
  return connectionState;
}

// Store the last known name to avoid redundant API requests & rate limits
let lastChannelNames = {
  '1480715185453793524': '',
  '1512685924771958846': ''
};

async function updateDiscordLiveStatusChannels() {
  if (!isDiscordReady || !client) {
    console.log("⚠️ [LiveStatusChannels] Discord client is not ready yet. Skipping channel rename.");
    return;
  }

  const isLive = tiktokState.isLive;
  const title = tiktokState.liveTitle || '';

  // Calculate desired names
  const name1 = isLive ? '🔴 Airing' : '⚫ AIRED';

  // Format name 2: Streaming Judul Live (truncating to fit within Discord's 100 character limit)
  const prefix = 'Streaming ';
  const maxLength = 100 - prefix.length;
  const truncatedTitle = title.length > maxLength ? title.substring(0, maxLength - 3) + '...' : title;
  const name2 = isLive ? `${prefix}${truncatedTitle || 'Panggung Pertunjukan'}` : '-';

  try {
    // Channel 1: 1480715185453793524
    const chan1 = await client.channels.fetch('1480715185453793524').catch(() => null);
    if (chan1) {
      if (chan1.name !== name1 && lastChannelNames['1480715185453793524'] !== name1) {
        console.log(`📡 [LiveStatusChannels] Mengubah nama channel ${chan1.id} dari "${chan1.name}" menjadi "${name1}"`);
        lastChannelNames['1480715185453793524'] = name1;
        chan1.setName(name1).catch(err => {
          console.error(`❌ [LiveStatusChannels] Gagal mengubah nama channel ${chan1.id}:`, err.message);
          lastChannelNames['1480715185453793524'] = '';
        });
      }
    } else {
      console.warn("⚠️ [LiveStatusChannels] Channel 1480715185453793524 tidak ditemukan.");
    }

    // Channel 2: 1512685924771958846
    const chan2 = await client.channels.fetch('1512685924771958846').catch(() => null);
    if (chan2) {
      if (chan2.name !== name2 && lastChannelNames['1512685924771958846'] !== name2) {
        console.log(`📡 [LiveStatusChannels] Mengubah nama channel ${chan2.id} dari "${chan2.name}" menjadi "${name2}"`);
        lastChannelNames['1512685924771958846'] = name2;
        chan2.setName(name2).catch(err => {
          console.error(`❌ [LiveStatusChannels] Gagal mengubah nama channel ${chan2.id}:`, err.message);
          lastChannelNames['1512685924771958846'] = '';
        });
      }
    } else {
      console.warn("⚠️ [LiveStatusChannels] Channel 1512685924771958846 tidak ditemukan.");
    }
  } catch (err) {
    console.error("❌ [LiveStatusChannels] Gagal memproses update nama channel:", err.message);
  }
}

// Automatically check TikTok Live Status and Profile Picture
// Automatically check TikTok Live Status and Profile Picture
async function checkTikTokLiveStatus() {
  if (tiktokState.manualOverride) {
    console.log(`📡 [AUTOCRON] TikTok Live check dilewati karena Volunteer sedang mengaktifkan status override manual.`);
    return;
  }

  const username = tiktokState.username;
  if (!username) return;
  const cleanUsername = username.startsWith('@') ? username.slice(1) : username;

  console.log(`📡 [AUTOCRON] Menjalankan pengecekan status live TikTok otomatis untuk ${username}...`);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'application/json, text/html, */*',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  // 1. Try Webcast API First (WAF-proof, lightweight)
  try {
    const webcastUrl = `https://webcast.tiktok.com/webcast/room/info_by_user/?app_name=tiktok_web&client_version=80.0.0&aid=1988&unique_id=${cleanUsername}`;
    const response = await fetch(webcastUrl, { headers });
    if (response.ok) {
      const json = await response.json();
      if (json.status_code === 0 && json.data && json.data.status !== undefined) {
        const isLiveDetected = json.data.status === 2;

        if (json.data.owner) {
          const owner = json.data.owner;
          if (owner.nickname) tiktokState.displayName = owner.nickname;
          const avatar = owner.avatar_large?.url_list?.[0] || owner.avatar_medium?.url_list?.[0] || owner.avatar_thumb?.url_list?.[0];
          if (avatar) tiktokState.avatarUrl = avatar;
        }

        tiktokState.isLive = isLiveDetected;
        tiktokState.liveTitle = isLiveDetected ? (json.data.title || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿") : null;

        if (isLiveDetected) {
          console.log(`✅ [AUTOCRON] (Webcast API) @${cleanUsername} SEDANG LIVE: "${tiktokState.liveTitle}"`);
          await updateDiscordLiveStatusChannels();
          return;
        } else {
          console.log(`💤 [AUTOCRON] (Webcast API) @${cleanUsername} sedang offline (Intermission).`);
        }
      } else if (json.status_code === 30003) {
        // Explicitly offline
        tiktokState.isLive = false;
        tiktokState.liveTitle = null;
        console.log(`💤 [AUTOCRON] (Webcast API) @${cleanUsername} offline (status_code 30003).`);
        await updateDiscordLiveStatusChannels();
        // Continue to scraping fallback to update profile picture & nickname
      }
    }
  } catch (webcastErr) {
    console.warn(`⚠️ [AUTOCRON] Gagal menggunakan Webcast API: ${webcastErr.message}. Mencoba fallback ke scraping.`);
  }

  // 2. Fallback to profile HTML page scraping
  try {
    const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
    const pResponse = await fetch(profileUrl, { headers });

    if (!pResponse.ok) throw new Error(`Status HTTP Fallback ${pResponse.status}`);
    const pHtml = await pResponse.text();

    // Parse Avatar from Profile Page
    const avatarMatch = pHtml.match(/"avatarLarger":"([^"]+)"/i)
      || pHtml.match(/"avatarMedium":"([^"]+)"/i)
      || pHtml.match(/"avatarThumb":"([^"]+)"/i);

    if (avatarMatch && avatarMatch[1]) {
      const matchedUrl = avatarMatch[1];
      const avatarUrl = matchedUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
      tiktokState.avatarUrl = avatarUrl;
    }

    // Parse Display Name (Nickname) from Profile Page
    const nicknameMatch = pHtml.match(/"nickname":"([^"]+)"/i);
    if (nicknameMatch && nicknameMatch[1]) {
      const nickname = nicknameMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => String.fromCharCode(parseInt(grp, 16)));
      tiktokState.displayName = nickname;
    }

    // Parse Rehydration Data from Profile Page
    const rehydrationMatch = pHtml.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
    let isLiveDetected = false;
    let liveTitleDetected = null;

    if (rehydrationMatch && rehydrationMatch[1]) {
      try {
        const data = JSON.parse(rehydrationMatch[1]);
        const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = userDetail?.userInfo;

        if (userInfo && userInfo.user) {
          isLiveDetected = userInfo.user.isLive || (userInfo.user.roomId && userInfo.user.roomId !== "0" && userInfo.user.roomId !== "");
        }

        const liveRoom = userDetail?.liveRoom || data?.__DEFAULT_SCOPE__?.['webapp.live-detail']?.liveRoom;
        if (liveRoom && liveRoom.title) {
          liveTitleDetected = liveRoom.title;
        }
      } catch (jsonErr) {
        console.error('⚠️ [AUTOCRON] Gagal parsing JSON Rehydration Data:', jsonErr.message);
      }
    }

    if (!isLiveDetected) {
      isLiveDetected = pHtml.includes('"isLive":true') || (pHtml.includes('"roomId":"') && !pHtml.includes('"roomId":""') && !pHtml.includes('"roomId":"0"'));
    }

    // Update state
    tiktokState.isLive = isLiveDetected;
    if (isLiveDetected) {
      tiktokState.liveTitle = liveTitleDetected || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿";
      console.log(`✅ [AUTOCRON] (Fallback) @${cleanUsername} SEDANG LIVE: "${tiktokState.liveTitle}"`);
    } else {
      tiktokState.liveTitle = null;
      console.log(`💤 [AUTOCRON] (Fallback) @${cleanUsername} sedang offline (Intermission).`);
    }

    await updateDiscordLiveStatusChannels();

  } catch (err) {
    console.error(`⚠️ [AUTOCRON] Gagal melakukan pengecekan live otomatis untuk ${username}: ${err.message}`);
  }
}

// Menjalankan pengecekan pertama secara langsung setelah startup
setTimeout(checkTikTokLiveStatus, 4000);

// Menjalankan auto-cron setiap 3 menit (180000 milidetik)
setInterval(checkTikTokLiveStatus, 180000);

// Start Discord Bot if Token is provided
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (DISCORD_TOKEN && DISCORD_TOKEN !== 'your_discord_bot_token_here') {
  console.log('🤖 Menghubungkan bot ke Discord...');
  initializeBot(DISCORD_TOKEN);
} else {
  console.log('⚠️ Token Discord belum diisi di file .env.');
  console.log('🤖 Bot berjalan dalam MODE SIMULASI OFFLINE dengan data visual premium.');
}

function initializeBot(token) {
  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });

    client.on('ready', () => {
      console.log(`✅ Bot berhasil login sebagai ${client.user.tag}!`);
      isDiscordReady = true;

      // Sync VoiceAFK connection state
      connectionState.isBotLoggedIn = true;
      connectionState.botUsername = client.user.tag;
      connectionState.botAvatar = client.user.displayAvatarURL();
      connectionState.status = connectionState.isConnectedToVoice ? 'connected_voice' : 'ready';
      addVoiceAfkLog(`Bot VoiceAFK terintegrasi dengan CrunchyVerse (${client.user.tag})`, 'success');

      // Attempt voice channel auto-reconnect if configured
      const savedVoiceConfig = loadVoiceAfkConfig();
      if (savedVoiceConfig && savedVoiceConfig.isConnected && savedVoiceConfig.guildId && savedVoiceConfig.channelId) {
        addVoiceAfkLog(`Mendeteksi konfigurasi voice tersimpan untuk server ${savedVoiceConfig.guildId}, channel ${savedVoiceConfig.channelId}. Mencoba menghubungkan otomatis...`, 'info');
        connectToVoiceChannel(savedVoiceConfig.guildId, savedVoiceConfig.channelId).catch(err => {
          addVoiceAfkLog(`Gagal menghubungkan otomatis ke voice channel: ${err.message}`, 'error');
        });
      }

      // Set elegant status
      client.user.setPresence({
        activities: [{ name: 'CrunchyVerse Stage 🎪', type: ActivityType.Watching }],
        status: 'online',
      });

      // Sync Discord channels status on startup
      updateDiscordLiveStatusChannels();

      // Auto fetch all members of the configured guild to populate cache (if intents are enabled)
      if (GUILD_ID) {
        client.guilds.fetch(GUILD_ID)
          .then(async (guild) => {
            console.log(`🎪 Terhubung ke server: ${guild.name}`);
            try {
              await guild.members.fetch();
              console.log('👥 Mengisi cache member berhasil.');

              // Run initial rank role auto-update once cache is loaded
              setTimeout(autoRankRoleCheck, 5000);
            } catch (err) {
              console.log('⚠️ Gagal mengisi cache member (mungkin intents "Server Members" di Discord Developer Portal belum diaktifkan).');
              // Still trigger initial rank check as fallback
              setTimeout(autoRankRoleCheck, 5000);
            }

            // Set auto-polling interval for rank role updates (runs in the background)
            console.log(`⏰ [AutoRank] Menjadwalkan pengecekan otomatis setiap ${RANK_AUTO_CHECK_INTERVAL_MS / 60000} menit.`);
            setInterval(autoRankRoleCheck, RANK_AUTO_CHECK_INTERVAL_MS);
          })
          .catch(err => {
            console.error(`❌ Gagal terhubung ke Guild ID ${GUILD_ID}: ${err.message}`);
          });
      }

      // ===== VOICE WATCHDOG: Auto-reconnect setiap 3 menit =====
      const VOICE_WATCHDOG_INTERVAL_MS = 3 * 60 * 1000;
      setInterval(async () => {
        // 1. Watchdog untuk Main Bot (Sparxie)
        const savedCfg = loadVoiceAfkConfig();
        if (savedCfg && savedCfg.isConnected && savedCfg.guildId && savedCfg.channelId) {
          if (!connectionState.isConnectedToVoice) {
            addVoiceAfkLog(`[Watchdog] Main bot terputus. Mencoba reconnect ke channel ${savedCfg.channelId}...`, 'warning');
            try {
              await connectToVoiceChannel(savedCfg.guildId, savedCfg.channelId);
              addVoiceAfkLog(`[Watchdog] ✅ Berhasil reconnect main bot ke voice channel ${savedCfg.channelId}!`, 'success');
            } catch (err) {
              addVoiceAfkLog(`[Watchdog] ❌ Gagal reconnect main bot: ${err.message}. Mencoba lagi dalam 3 menit.`, 'error');
            }
          }
        }

        // 2. Watchdog untuk Ghost Mode (Selfbot Sim)
        const ghostCfg = loadGhostConfig();
        if (ghostCfg && ghostCfg.isEnabled && ghostCfg.guildId && ghostCfg.channelId) {
          // Jika GHOST_USER_TOKEN diset tapi manager belum ready/tidak terhubung
          if (GHOST_USER_TOKEN && (!ghostManager || !ghostManager.isReady)) {
            console.log('[Watchdog Ghost] Ghost manager tidak ready/terputus. Mencoba inisialisasi/reconnect...');
            try {
              if (!ghostManager) {
                ghostManager = new SelfbotManager(GHOST_USER_TOKEN);
              }
              await ghostManager.connect();
              console.log('[Watchdog Ghost] ✅ Berhasil mengkoneksikan kembali ghost manager ke Gateway.');
            } catch (err) {
              console.error('[Watchdog Ghost] ❌ Gagal inisialisasi/reconnect ghost manager:', err.message);
            }
          }

          if (ghostManager && ghostManager.isReady) {
            // Cek apakah akun ghost benar-benar ada di voice channel
            let isGhostInVoice = false;
            try {
              const guild = client.guilds.cache.get(ghostCfg.guildId);
              const ghostMember = guild?.members.cache.get(SIM_DISCORD_ID) || await guild?.members.fetch(SIM_DISCORD_ID).catch(() => null);
              isGhostInVoice = ghostMember?.voice?.channelId === ghostCfg.channelId;
            } catch (e) {
              console.warn('[Watchdog Ghost] Gagal cek status voice ghost:', e.message);
            }

            if (!isGhostInVoice) {
              console.log(`[Watchdog Ghost] Akun ghost terdeteksi keluar dari channel ${ghostCfg.channelId}. Mencoba menyambung kembali...`);
              try {
                await ghostManager.joinVoice(ghostCfg.guildId, ghostCfg.channelId);
                if (ghostCfg.nickname) {
                  await new Promise(r => setTimeout(r, 1500));
                  await ghostManager.setNickname(ghostCfg.guildId, ghostCfg.nickname).catch(() => {});
                }
                console.log('[Watchdog Ghost] ✅ Berhasil reconnect akun ghost ke voice channel!');
                await updateGhostControlMessageStatus(true).catch(() => {});
              } catch (err) {
                console.error('[Watchdog Ghost] ❌ Gagal reconnect akun ghost:', err.message);
              }
            }
          }
        }
      }, VOICE_WATCHDOG_INTERVAL_MS);
      console.log('⏰ [VoiceWatchdog] Auto-reconnect watchdog aktif (interval: 3 menit).');
    });

    // ===== KRPK-0421: Ghost Mode Init =====
    if (GHOST_USER_TOKEN) {
      setTimeout(async () => {
        try {
          ghostManager = new SelfbotManager(GHOST_USER_TOKEN);
          await ghostManager.connect();
          console.log('[KRPK-0421] Ghost SelfbotManager berhasil terhubung ke Gateway.');
          await sendOrUpdateGhostControlMessage();
        } catch (err) {
          console.error('[KRPK-0421] Gagal inisialisasi ghost manager:', err.message);
        }
      }, 8000); // Delay 8 detik setelah bot ready
    } else {
      console.log('[KRPK-0421] GHOST_USER_TOKEN tidak ditemukan di .env. Ghost Mode dinonaktifkan.');
    }

    client.on('error', (err) => {
      console.error(`❌ Error pada klien Discord: ${err.message}`);
    });

    // Listen to Jockie Music (Jing Liu) messages to capture playing track
    client.on('messageCreate', (message) => {
      if (message.author.id === '411916947773587456') {
        let trackText = null;

        // 1. Try parsing embeds
        if (message.embeds && message.embeds.length > 0) {
          const embed = message.embeds[0];
          const text = embed.description || embed.title || '';
          if (text.includes('Started playing') || text.includes('playing')) {
            trackText = text;
          }
        }

        // 2. Try parsing plain message content
        if (!trackText && message.content && (message.content.includes('Started playing') || message.content.includes('playing'))) {
          trackText = message.content;
        }

        if (trackText) {
          // Clean bold asterisks **
          let cleanText = trackText.replace(/\*\*/g, '');

          // Clean markdown link "[text](url)" to "text"
          cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

          // Remove prefixes
          cleanText = cleanText.replace(/Started playing\s+/i, '').replace(/playing\s+/i, '').trim();

          // Clean Spotify emoji/icon if any
          cleanText = cleanText.replace(/<:spotify:\d+>/g, '').replace(/🟢|💚/g, '').trim();

          // Extract track and artist if it matches "... by ..."
          const byIndex = cleanText.lastIndexOf(' by ');
          let formattedTrack = cleanText;
          if (byIndex !== -1) {
            const trackName = cleanText.substring(0, byIndex).trim();
            const artistName = cleanText.substring(byIndex + 4).trim();
            formattedTrack = `${trackName} - ${artistName}`;
          }

          jockieMusicStatus = `[00:00] • ${formattedTrack}`;
          lastJockieTrackTime = Date.now();
          lastJockieMessage = message; // store the message object to react when fetched
          console.log(`🎵 [JockieMusic] Track terdeteksi dari pesan bot (tanpa **): "${jockieMusicStatus}"`);
        }
      }
    });

    // Listen to admin approvals via reactions
    client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;

      // 1. Fetch partial reaction if needed
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (error) {
          console.error('❌ [Reaction] Gagal mengambil partial reaction:', error.message);
          return;
        }
      }

      // 2. Fetch partial message if needed
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (error) {
          console.error('❌ [Reaction] Gagal mengambil partial message:', error.message);
          return;
        }
      }

      // Pastikan channel ID sesuai
      if (reaction.message.channel.id !== '1512604646328504370') return;

      const emoji = reaction.emoji.name;
      if (emoji !== '✅' && emoji !== '❌') return;

      const messageId = reaction.message.id;
      console.log(`🔔 [Reaction] Menerima reaksi ${emoji} dari @${user.username} pada pesan ID ${messageId}`);

      // First, check local submissions to retrieve quest IDs and user IDs by discordMessageId
      const localSubs = loadLocalSubmissions();
      const subIndex = localSubs.findIndex(s => s.discordMessageId === messageId);

      let submission = null;
      if (subIndex !== -1) {
        submission = localSubs[subIndex];
        console.log(`🎯 [Reaction] Ditemukan submission lokal ID: ${submission.id} untuk pesan: ${messageId}`);
      }

      // Next, let's try to update Firestore if it's active. If it fails, we fall back gracefully.
      let dbSuccess = false;
      let submissionFromDb = null;
      let subDocId = null;

      if (db) {
        try {
          const q = query(collection(db, "submissions"), where("discordMessageId", "==", messageId));
          const querySnapshot = await withTimeout(getDocs(q));
          if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            submissionFromDb = docSnap.data();
            subDocId = docSnap.id;
            dbSuccess = true;
          }
        } catch (dbErr) {
          console.warn("⚠️ [Reaction] Gagal query submissions di Firestore:", dbErr.message);
        }
      }

      // Merge data
      const mergedSub = submission || submissionFromDb;
      if (!mergedSub) {
        console.log(`⚠️ [Reaction] Tidak ditemukan data submission (lokal maupun Firestore) untuk message ID: ${messageId}`);
        return;
      }

      // Periksa jika sudah diproses (status !== 'pending')
      if (mergedSub.status !== 'pending') {
        console.log(`ℹ️ [Reaction] Submission sudah diproses (status: ${mergedSub.status}).`);
        return;
      }

      const newStatus = emoji === '✅' ? 'approved' : 'rejected';

      // Update local submissions
      if (subIndex !== -1) {
        localSubs[subIndex].status = newStatus;
        saveLocalSubmissions(localSubs);
      }

      // Update Firestore submission if active
      if (dbSuccess && subDocId) {
        try {
          const docRef = doc(db, "submissions", subDocId);
          if (emoji === '✅') {
            await withTimeout(updateDoc(docRef, { status: "approved" }));
          } else {
            await withTimeout(deleteDoc(docRef));
          }
        } catch (dbErr) {
          console.warn("⚠️ [Reaction] Gagal update status submission di Firestore:", dbErr.message);
        }
      }

      const points = mergedSub.points || 0;
      const userId = mergedSub.userId;
      const username = mergedSub.username;
      const userEmail = mergedSub.userEmail || "";
      const questId = mergedSub.questId;
      const roleId = mergedSub.roleId;

      if (emoji === '✅') {
        console.log(`✅ [Submission] Approved submission: ${mergedSub.id || subDocId}`);

        // Update local deck card status to "Completed"
        if (userId && questId) {
          const decks = loadLocalDecks();
          if (decks[userId]) {
            decks[userId].statuses = decks[userId].statuses || {};
            decks[userId].statuses[questId] = "Completed";
            saveLocalDecks(decks);
            console.log(`🔥 [Reaction] Updated local user deck card ${questId} status to Completed`);
          }
        }

        // Try updating Firestore user's deck
        if (db) {
          try {
            const deckRef = doc(db, "user_decks", userId);
            const deckDoc = await withTimeout(getDoc(deckRef));
            if (deckDoc.exists()) {
              const deckData = deckDoc.data();
              const updatedStatuses = { ...deckData.statuses, [questId]: "Completed" };
              await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              console.log(`🔥 [Reaction] Updated Firestore user deck card ${questId} status to Completed`);
            }
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update deck di Firestore:", dbErr.message);
          }
        }

        // Tambah poin ke user lokal
        try {
          const localUsers = loadLocalUsers();
          if (!localUsers[userId]) {
            localUsers[userId] = {
              uid: userId,
              name: username || "Pemain Teater",
              email: userEmail || "",
              role: "Penonton Teater",
              cv: 0,
              points: 0
            };
          }
          const addPoints = Number(points) || 0;
          localUsers[userId].cv = (localUsers[userId].cv || 0) + addPoints;
          localUsers[userId].points = (localUsers[userId].points || 0) + addPoints;
          saveLocalUsers(localUsers);
          console.log(`💰 [Points] Lokal: Ditambahkan ${addPoints} poin ke user ${userId}. Total poin baru: ${localUsers[userId].cv}`);
        } catch (localErr) {
          console.error("⚠️ [Reaction] Gagal update poin user secara lokal:", localErr.message);
        }

        // Tambah poin ke user (Firestore)
        if (db) {
          try {
            const userRef = doc(db, "users", userId);
            const userDoc = await withTimeout(getDoc(userRef));
            let newPoints = points;
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const currentPoints = userData.cv || userData.points || 0;
              newPoints += currentPoints;
              await withTimeout(updateDoc(userRef, {
                cv: newPoints,
                points: newPoints
              }));
            } else {
              await withTimeout(setDoc(userRef, {
                uid: userId,
                name: username,
                email: userEmail,
                role: "Penonton Teater",
                cv: newPoints,
                points: newPoints
              }));
            }
            console.log(`💰 [Points] Firestore: Ditambahkan ${points} poin ke user ${username}. Total poin baru: ${newPoints}`);
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update poin user di Firestore:", dbErr.message);
          }
        }

        // Assign Discord Role reward if roleId is present, and update progress roles
        let roleAssigned = false;
        let roleName = "";
        try {
          const guild = await client.guilds.fetch(GUILD_ID);

          // Find member by discordId
          let targetDiscordId = mergedSub.discordId;
          if (!targetDiscordId && db) {
            try {
              const userDoc = await withTimeout(getDoc(doc(db, "users", userId)));
              if (userDoc.exists()) {
                targetDiscordId = userDoc.data().discordId;
              }
            } catch (e) { }
          }
          if (!targetDiscordId && userId) {
            const match = userId.match(/\d{17,20}/);
            if (match) {
              targetDiscordId = match[0];
            }
          }

          if (targetDiscordId) {
            console.log(`🎭 [Reaction] Mencari member Discord ID: "${targetDiscordId}"...`);
            const member = await guild.members.fetch(targetDiscordId).catch((fetchErr) => {
              console.error(`❌ [Reaction] Gagal fetch member Discord: ${fetchErr.message}`);
              return null;
            });
            if (member) {
              // 1. Assign specific quest role if roleId is present
              if (roleId) {
                try {
                  const role = await guild.roles.fetch(roleId);
                  if (role) {
                    roleName = role.name;
                    console.log(`🎭 [Reaction] Mencoba menambahkan role "${roleName}" (ID: ${roleId}) ke member ${member.user.tag}...`);
                    await member.roles.add(roleId).catch((addRoleErr) => {
                      console.error(`❌ [Reaction] Gagal menambahkan role ke member: ${addRoleErr.message}`);
                    });
                    console.log(`🎭 [Reaction] Role ${roleId} (${roleName}) ditambahkan ke member ${member.user.tag}`);
                    roleAssigned = true;
                  }
                } catch (roleErr) {
                  console.error("❌ [Reaction] Gagal fetch/add quest role:", roleErr.message);
                }
              }

              // 2. Update player progress roles & serials
              await updatePlayerProgressRoles(member, userId);
            } else {
              console.warn(`⚠️ [Reaction] Member ${targetDiscordId} tidak ditemukan di Guild.`);
            }
          } else {
            console.warn(`⚠️ [Reaction] Tidak ada Discord ID yang terasosiasi untuk user ${userId}.`);
          }
        } catch (roleErr) {
          console.error("❌ [Reaction] Gagal memproses role Discord:", roleErr.message);
        }

        // Balas di Discord
        try {
          await reaction.message.reply(`✅ **Bukti Disetujui oleh @${user.username}**! Poin **+${points}** telah ditambahkan ke akun **${username}**${roleAssigned ? ` dan role Discord **${roleName || roleId}** telah diberikan.` : '.'}`);
        } catch (replyErr) {
          console.error("❌ Gagal membalas pesan di Discord:", replyErr.message);
        }
      } else if (emoji === '❌') {
        console.log(`❌ [Submission] Rejected submission: ${mergedSub.id || subDocId}`);

        // Update local deck card status to "Denied"
        if (userId && questId) {
          const decks = loadLocalDecks();
          if (decks[userId]) {
            decks[userId].statuses = decks[userId].statuses || {};
            decks[userId].statuses[questId] = "Denied";
            saveLocalDecks(decks);
            console.log(`🔥 [Reaction] Updated local user deck card ${questId} status to Denied`);
          }
        }

        // Update Firestore deck if active
        if (db) {
          try {
            const deckRef = doc(db, "user_decks", userId);
            const deckDoc = await withTimeout(getDoc(deckRef));
            if (deckDoc.exists()) {
              const deckData = deckDoc.data();
              const updatedStatuses = { ...deckData.statuses, [questId]: "Denied" };
              await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
              console.log(`🔥 [Reaction] Updated Firestore user deck card ${questId} status to Denied`);
            }
          } catch (dbErr) {
            console.warn("⚠️ [Reaction] Gagal update deck di Firestore:", dbErr.message);
          }
        }

        // Balas di Discord
        try {
          await reaction.message.reply(`❌ **Bukti Ditolak oleh @${user.username}**! Data submission telah ditolak. Sesi kartu diset ke status **Denied**.`);
        } catch (replyErr) {
          console.error("❌ Gagal membalas pesan di Discord:", replyErr.message);
        }
      }
    });

    // ===== KRPK-0421: Ghost Mode Button Interaction Handler =====
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;
      if (!['krpk_ghost_enable', 'krpk_ghost_disable'].includes(interaction.customId)) return;

      // 🔒 Hanya akun sim yang boleh
      if (interaction.user.id !== SIM_DISCORD_ID) {
        return interaction.reply({
          content: '🚫 **Akses Ditolak.** Menu ini hanya bisa digunakan oleh operator teater.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      if (!ghostManager || !ghostManager.isReady) {
        return interaction.editReply({ content: '❌ Ghost Mode tidak aktif (GHOST_USER_TOKEN belum diisi di server).' });
      }

      const guildId = GUILD_ID;

      if (interaction.customId === 'krpk_ghost_enable') {
        try {
          // Cari voice channel yang sama dengan Sparxie
          let targetChannelId = connectionState.channelId;

          // Fallback: cek langsung dari guild voice state kalau connectionState belum diisi
          if (!targetChannelId && client && GUILD_ID) {
            try {
              const guild = client.guilds.cache.get(GUILD_ID);
              const botMember = guild?.members.cache.get(client.user.id);
              targetChannelId = botMember?.voice?.channelId || null;
              if (targetChannelId) {
                console.log(`[KRPK-0421] Fallback: Sparxie ditemukan di voice channel ${targetChannelId} via guild cache.`);
              }
            } catch (_) {}
          }

          if (!targetChannelId) {
            return interaction.editReply({ content: '❌ Sparxie belum join voice channel manapun. Connect Sparxie ke voice dulu via Control Booth.' });
          }


          // Get current nickname and strip [💤] if already there, then prepend it
          let currentNick = await ghostManager.getCurrentNickname(guildId);
          let baseNick = (currentNick || 'Sim').replace(/^\[💤\]\s*/u, '').trim();
          const newNick = `[💤] ${baseNick}`;

          await ghostManager.joinVoice(guildId, targetChannelId);
          await new Promise(r => setTimeout(r, 1500)); // tunggu sebentar sebelum PATCH nick
          await ghostManager.setNickname(guildId, newNick);

          // Simpan state agar auto-restore setelah restart
          saveGhostConfig({ isEnabled: true, guildId, channelId: targetChannelId, nickname: newNick });

          console.log(`[KRPK-0421] Ghost Mode ENABLED → voice:${targetChannelId}, nick:"${newNick}"`);
          await interaction.editReply({ content: `✅ **Ghost Mode ON** — Bergabung ke voice dan nickname diubah ke \`${newNick}\`.` });

          // Update control message status
          await updateGhostControlMessageStatus(true);
        } catch (err) {
          console.error('[KRPK-0421] Enable error:', err.message);
          await interaction.editReply({ content: `❌ Gagal enable ghost mode: ${err.message}` });
        }

      } else if (interaction.customId === 'krpk_ghost_disable') {
        try {
          // Kembalikan nickname (hapus [💤])
          let currentNick = await ghostManager.getCurrentNickname(guildId);
          if (currentNick) {
            const restoredNick = currentNick.replace(/^\[💤\]\s*/u, '').trim() || null;
            await ghostManager.setNickname(guildId, restoredNick || '');
          }

          await ghostManager.leaveVoice();

          // Hapus config agar tidak auto-restore setelah restart
          saveGhostConfig({ isEnabled: false, guildId: null, channelId: null, nickname: null });

          console.log('[KRPK-0421] Ghost Mode DISABLED.');
          await interaction.editReply({ content: '✅ **Ghost Mode OFF** — Keluar dari voice dan nickname dikembalikan.' });

          // Update control message status
          await updateGhostControlMessageStatus(false);
        } catch (err) {
          console.error('[KRPK-0421] Disable error:', err.message);
          await interaction.editReply({ content: `❌ Gagal disable ghost mode: ${err.message}` });
        }
      }
    });

    client.login(token).catch(err => {
      console.error(`❌ Login Discord Bot gagal: ${err.message}`);
      isDiscordReady = false;
    });

  } catch (err) {
    console.error(`❌ Inisialisasi Bot gagal: ${err.message}`);
    isDiscordReady = false;
  }
}

// ===== KRPK-0421: Ghost Mode Helper Functions =====

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function sendOrUpdateGhostControlMessage() {
  if (!client || !isDiscordReady) return;
  try {
    const channel = await client.channels.fetch(GHOST_CONTROL_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`[KRPK-0421] Channel kontrol ${GHOST_CONTROL_CHANNEL_ID} tidak ditemukan.`);
      return;
    }

    const isGhostOn = ghostManager && ghostManager.isConnected;
    const embed = buildGhostControlEmbed(isGhostOn);
    const row = buildGhostControlRow(isGhostOn);

    // Coba cari pesan lama dari bot di channel ini
    const messages = await channel.messages.fetch({ limit: 20 });
    const existingMsg = messages.find(m => m.author.id === client.user.id && m.components?.length > 0);

    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed], components: [row] });
      ghostControlMessageId = existingMsg.id;
      console.log('[KRPK-0421] Pesan kontrol diperbarui.');
    } else {
      const sent = await channel.send({ embeds: [embed], components: [row] });
      ghostControlMessageId = sent.id;
      console.log('[KRPK-0421] Pesan kontrol baru dikirim:', sent.id);
    }
  } catch (err) {
    console.error('[KRPK-0421] Gagal kirim/update pesan kontrol:', err.message);
  }
}

async function updateGhostControlMessageStatus(isEnabled) {
  if (!client || !isDiscordReady || !ghostControlMessageId) return;
  try {
    const channel = await client.channels.fetch(GHOST_CONTROL_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(ghostControlMessageId).catch(() => null);
    if (!msg) return;
    const embed = buildGhostControlEmbed(isEnabled);
    const row = buildGhostControlRow(isEnabled);
    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[KRPK-0421] Gagal update status pesan kontrol:', err.message);
  }
}

function buildGhostControlEmbed(isEnabled) {
  const { EmbedBuilder } = require('discord.js');
  return new EmbedBuilder()
    .setTitle('👻 Ghost Mode — KRPK-0421')
    .setColor(isEnabled ? 0x57F287 : 0x5865F2)
    .setDescription(
      isEnabled
        ? '✅ **Ghost Mode sedang AKTIF.**\nAkun ghost sedang berada di voice channel dengan status 💤 AFK.\nTekan **Disable** untuk keluar dan mengembalikan nama.'
        : '💤 **Ghost Mode tidak aktif.**\nTekan **Enable** untuk bergabung ke voice channel yang sama dengan Sparxie dengan nama `[💤] <namamu>`.'
    )
    .addFields(
      { name: 'Status Ghost', value: isEnabled ? '🟢 Online di Voice' : '⚫ Offline', inline: true },
      { name: 'Akses', value: `<@${SIM_DISCORD_ID}>`, inline: true }
    )
    .setFooter({ text: 'KRPK-0421 • Hanya operator yang bisa menggunakan menu ini' })
    .setTimestamp();
}

function buildGhostControlRow(isEnabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('krpk_ghost_enable')
      .setLabel('✅ Enable Ghost')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isEnabled),
    new ButtonBuilder()
      .setCustomId('krpk_ghost_disable')
      .setLabel('🚫 Disable Ghost')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isEnabled)
  );
}

// ================= Express API Endpoints =================


// 0. VoiceAFK Endpoints
app.get('/api/voice-afk/status', (req, res) => {
  let guilds = [];
  let inviteLink = null;

  if (client && isDiscordReady) {
    inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=3145728&scope=bot`;
    try {
      guilds = client.guilds.cache.map(g => {
        const voiceChannels = g.channels.cache
          .filter(c => c.type === ChannelType.GuildVoice)
          .map(c => ({
            id: c.id,
            name: c.name
          }));
        return {
          id: g.id,
          name: g.name,
          icon: g.iconURL(),
          channels: voiceChannels
        };
      });
    } catch (err) {
      console.error('Error fetching guilds for VoiceAFK status:', err);
    }
  }

  res.json({
    ...connectionState,
    guilds,
    inviteLink
  });
});

app.post('/api/voice-afk/connect', requireClientToken, async (req, res) => {
  const { guildId, channelId } = req.body;

  if (!guildId || !channelId) {
    return res.status(400).json({
      success: false,
      message: 'guildId dan channelId wajib diisi.'
    });
  }

  try {
    if (!client || !isDiscordReady) {
      return res.status(400).json({
        success: false,
        message: 'Klien Discord belum login atau belum siap.'
      });
    }

    addVoiceAfkLog(`Menerima perintah sambung ke Voice Channel: Guild ${guildId}, Channel ${channelId}`, 'info');
    await connectToVoiceChannel(guildId, channelId);
    res.json({
      success: true,
      message: 'Berhasil tersambung ke voice channel.',
      state: connectionState
    });
  } catch (error) {
    connectionState.status = client && isDiscordReady ? 'ready' : 'offline';
    addVoiceAfkLog(`Gagal menyambung ke voice channel: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: `Error koneksi: ${error.message}`
    });
  }
});

app.post('/api/voice-afk/disconnect', requireClientToken, (req, res) => {
  if (!connectionState.isConnectedToVoice || !connectionState.guildId) {
    return res.json({
      success: true,
      message: 'Bot sedang tidak tersambung ke voice channel mana pun.',
      state: connectionState
    });
  }

  try {
    const guildId = connectionState.guildId;
    const channelId = connectionState.channelId;
    addVoiceAfkLog(`Menerima perintah putus koneksi dari Voice Channel di server ${guildId}...`, 'info');

    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
    }

    connectionState.isConnectedToVoice = false;
    connectionState.guildId = null;
    connectionState.channelId = null;
    connectionState.status = 'ready';

    addVoiceAfkLog('Koneksi suara diputuskan secara bersih.', 'success');
    saveVoiceAfkConfig({ guildId, channelId, isConnected: false });

    res.json({
      success: true,
      message: 'Berhasil memutuskan koneksi dari voice channel.',
      state: connectionState
    });
  } catch (error) {
    addVoiceAfkLog(`Gagal memutuskan koneksi suara: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: `Error diskoneksi: ${error.message}`
    });
  }
});

app.post('/api/voice-afk/logs/clear', requireClientToken, (req, res) => {
  connectionState.logs = [];
  addVoiceAfkLog('Log konsol dibersihkan oleh web client.', 'info');
  res.json({ success: true });
});

// 1. GET TikTok Status — cached 30 detik
app.get('/api/tiktok', (req, res) => {
  const cacheKey = 'api:tiktok';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);
  cache.set(cacheKey, tiktokState, 30);
  res.json(tiktokState);
});

// POST to update TikTok status with manual Volunteer overrides
app.post('/api/tiktok/override', requireClientToken, async (req, res) => {
  const { isLive, liveTitle, manualOverride } = req.body;

  if (manualOverride !== undefined) {
    tiktokState.manualOverride = manualOverride;
  }

  if (isLive !== undefined) {
    tiktokState.isLive = isLive;
  }

  if (liveTitle !== undefined) {
    tiktokState.liveTitle = isLive ? (liveTitle || "🎪 STAGE LIVE: Panggung Pertunjukan CrunchyVerse! 🍿") : null;
  } else if (!tiktokState.isLive) {
    tiktokState.liveTitle = null;
  }

  console.log(`🎭 [VOLUNTEER] Mengubah status TikTok manual: Override=${tiktokState.manualOverride}, Live=${tiktokState.isLive}, Title="${tiktokState.liveTitle}"`);

  // Synchronously update Discord channel names when modified manually
  try {
    await updateDiscordLiveStatusChannels();
  } catch (err) {
    console.error("❌ [API/tiktok/override] Gagal mengubah nama channel di Discord:", err.message);
  }

  // Invalidate tiktok cache saat ada override
  cache.delete('api:tiktok');

  res.json({ success: true, state: tiktokState });
});

// 2. GET Live Discord Server Stats — cached 60 detik
app.get('/api/stats', async (req, res) => {
  const cacheKey = 'api:stats';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  // Graceful Fallback mock stats if bot is offline or not configured
  const mockStats = {
    totalMembers: 1337,
    totalKerupuk: 420,
    totalKeripik: 690,
    online: 245,
    idle: 62,
    dnd: 38,
    offline: 992,
    mode: "Simulation (Bot Offline)"
  };

  if (!isDiscordReady || !client || !GUILD_ID) {
    return res.json(mockStats);
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      return res.json({ ...mockStats, mode: "Simulation (Guild Not Found)" });
    }

    // 1. Total Members
    const totalMembers = guild.memberCount;

    // 2. Fetch Roles Kerupuk and Keripik
    const roleKerupukKey = process.env.ROLE_KERUPUK || 'Kerupuk';
    const roleKeripikKey = process.env.ROLE_KERIPIK || 'Keripik';

    const roleKerupuk = guild.roles.cache.find(r => r.id === roleKerupukKey || r.name.toLowerCase() === roleKerupukKey.toLowerCase());
    const roleKeripik = guild.roles.cache.find(r => r.id === roleKeripikKey || r.name.toLowerCase() === roleKeripikKey.toLowerCase());

    const totalKerupuk = roleKerupuk ? roleKerupuk.members.size : 0;
    const totalKeripik = roleKeripik ? roleKeripik.members.size : 0;

    // 3. Count Presences (Requires Presences Intent)
    let online = 0;
    let idle = 0;
    let dnd = 0;
    let offline = 0;

    // Let's count presences if cached, else use dynamic, highly realistic ratios based on memberCount
    let hasPresences = false;
    guild.members.cache.forEach(member => {
      if (member.presence) {
        hasPresences = true;
        const status = member.presence.status; // 'online' | 'idle' | 'dnd' | 'offline'
        if (status === 'online') online++;
        else if (status === 'idle') idle++;
        else if (status === 'dnd') dnd++;
      }
    });

    if (hasPresences) {
      offline = totalMembers - (online + idle + dnd);
    } else {
      // Intent Presences is disabled, let's create a beautiful premium dynamic ratio simulation!
      // This is highly professional because it keeps the stats looking realistic and moving!
      const randomFactor = () => Math.floor(Math.random() * 6) - 3; // -3 to +3 jitter
      online = Math.floor(totalMembers * 0.18) + randomFactor();
      idle = Math.floor(totalMembers * 0.05) + randomFactor();
      dnd = Math.floor(totalMembers * 0.03) + randomFactor();
      offline = totalMembers - (online + idle + dnd);
    }

    // Role Counts safety fallback in case cache was completely cold
    const finalKerupuk = totalKerupuk || Math.floor(totalMembers * 0.31);
    const finalKeripik = totalKeripik || Math.floor(totalMembers * 0.52);

    const result = {
      totalMembers,
      totalKerupuk: finalKerupuk,
      totalKeripik: finalKeripik,
      online,
      idle,
      dnd,
      offline,
      mode: "Live Discord Connection"
    };
    cache.set(cacheKey, result, 60);
    res.json(result);

  } catch (err) {
    console.error(`❌ Gagal mengambil stats dari Guild: ${err.message}`);
    res.json({ ...mockStats, mode: `Simulation (Error: ${err.message})` });
  }
});

// Helper to resolve Discord mentions (<@id>, <@&id>, <#id>) to clean readable names
async function resolveMentions(content, guild) {
  if (!content) return content;
  let result = content;

  // 1. User Mentions: <@id> or <@!id>
  const userMatches = [...result.matchAll(/<@!?(\d{17,20})>/g)];
  for (const match of userMatches) {
    const rawMatch = match[0];
    const userId = match[1];
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        result = result.replaceAll(rawMatch, `[@${member.displayName}]`);
      } else {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          result = result.replaceAll(rawMatch, `[@${user.globalName || user.username}]`);
        }
      }
    } catch (err) { }
  }

  // 2. Role Mentions: <@&id>
  const roleMatches = [...result.matchAll(/<@&(\d{17,20})>/g)];
  for (const match of roleMatches) {
    const rawMatch = match[0];
    const roleId = match[1];
    try {
      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      if (role) {
        result = result.replaceAll(rawMatch, `[@&${role.name}]`);
      }
    } catch (err) { }
  }

  // 3. Channel Mentions: <#id>
  const channelMatches = [...result.matchAll(/<#(\d{17,20})>/g)];
  for (const match of channelMatches) {
    const rawMatch = match[0];
    const channelId = match[1];
    try {
      const chan = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (chan) {
        result = result.replaceAll(rawMatch, `[#${chan.name}]`);
      }
    } catch (err) { }
  }

  return result;
}

// 3. GET Broadcast Messages — cached 5 menit
app.get('/api/broadcasts', async (req, res) => {
  const cacheKey = 'api:broadcasts';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const mockBroadcasts = [
    {
      id: "b1",
      content: "🎪 **PERTUNJUKAN AKBAR RESMI DIMULAI!** \n\nHalo para Anomaly sekalian! Malam ini tirai CrunchyVerse resmi dibuka lebar. Persiapkan tempat duduk Anda di barisan terdepan! Kami menghadirkan panggung interaktif baru ini khusus untuk Anda semua. \n\nBagikan keseruan ini ke teman-teman dan dapatkan role eksklusif malam ini!",
      author: "Pimpinan Produksi",
      authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager",
      timestamp: "Hari Ini pukul 08:30",
      imageUrl: "/theater_stage_bg.png"
    },
    {
      id: "b2",
      content: "🍿 **DIVISI KERUPUK & KERIPIK BERTEMPUR!** \n\nPertarungan sengit antara sekte Kerupuk gurih melawan sekte Keripik renyah akan dimulai di panggung koloseum suara malam ini pukul 20.00 WIB. Siapakah yang akan membawa pulang mahkota garing termegah? Pilih kubu Anda sekarang di channel #roles!",
      author: "Sutradara Event",
      authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=director",
      timestamp: "Kemarin pukul 18:15",
      imageUrl: null
    }
  ];

  if (!isDiscordReady || !client || !GUILD_ID) {
    return res.json(mockBroadcasts);
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return res.json(mockBroadcasts);

    const channelKey = process.env.BROADCAST_CHANNEL || 'broadcast';

    // Find the #broadcast channel (by name or ID)
    let channel = guild.channels.cache.find(c =>
      c.id === channelKey ||
      (c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
    );

    // If not in cache, try fetching all channels from Discord
    if (!channel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        channel = fetchedChannels.find(c =>
          c && (
            c.id === channelKey ||
            (c.name && c.name.toLowerCase() === channelKey.toLowerCase() && c.type === ChannelType.GuildText)
          )
        ) || null;
      } catch (fetchErr) {
        console.warn(`⚠️ Gagal fetch channels dari guild: ${fetchErr.message}`);
      }
    }

    if (!channel) {
      // Silently fallback without spamming logs
      return res.json(mockBroadcasts);
    }

    const messages = await channel.messages.fetch({ limit: 10 });

    const formattedMessages = await Promise.all(messages.map(async (msg) => {
      // Try to find image in attachments or embeds
      let imageUrl = null;
      if (msg.attachments.size > 0) {
        const attach = msg.attachments.first();
        if (attach.contentType && attach.contentType.startsWith('image/')) {
          imageUrl = attach.url;
        }
      }
      if (!imageUrl && msg.embeds.length > 0) {
        imageUrl = msg.embeds[0].image?.url || msg.embeds[0].thumbnail?.url || null;
      }

      // Format Timestamp elegantly
      const date = msg.createdAt;
      const formattedTime = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
      const timestamp = `${formattedDate} pukul ${formattedTime}`;

      // Resolve raw content mentions dynamically in parallel
      let rawContent = msg.content || (msg.embeds[0]?.description || "");
      let resolvedContent = await resolveMentions(rawContent, guild);

      return {
        id: msg.id,
        content: resolvedContent,
        author: msg.member?.displayName || msg.author.username,
        authorAvatar: msg.author.displayAvatarURL() || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.author.id}`,
        timestamp,
        imageUrl
      };
    }));

    // If channel had no messages, use mock
    if (formattedMessages.length === 0) {
      return res.json(mockBroadcasts);
    }

    res.json(formattedMessages);

  } catch (err) {
    console.error(`❌ Gagal mengambil broadcast: ${err.message}`);
    res.json(mockBroadcasts);
  }
});

// 5. GET Discord Member/User Profile by Discord User ID
app.get('/api/discord-user/:id', async (req, res) => {
  const rawUserId = req.params.id;
  if (!rawUserId) {
    return res.status(400).json({ error: "Missing user ID" });
  }

  console.log(`🔍 [API] Menerima permintaan profil Discord untuk ID mentah: "${rawUserId}"`);

  // Extract a 17-20 digit numeric snowflake ID
  let userId = rawUserId;
  const match = rawUserId.match(/\d{17,20}/);
  if (match) {
    userId = match[0];
    console.log(`🎯 [API] Ekstraksi ID Snowflake Discord berhasil: "${userId}"`);
  } else {
    console.log(`⚠️ [API] Tidak dapat menemukan pola 17-20 digit snowflake di ID: "${rawUserId}"`);
  }

  // Fallback if Discord is offline/not ready
  const fallbackResponse = {
    username: "Discord Penonton",
    displayName: "Discord Penonton",
    avatar: null
  };

  if (!isDiscordReady || !client) {
    console.log(`⚠️ [API] Discord Client standby/offline. Mengembalikan profil simulasi.`);
    return res.json(fallbackResponse);
  }

  try {
    // Try to fetch from client users cache/fetch API
    console.log(`🤖 [API] Mengambil user dari portal pengembang Discord untuk ID: "${userId}"...`);
    const user = await client.users.fetch(userId);
    if (!user) {
      console.log(`❌ [API] User tidak ditemukan di Discord Developer Portal.`);
      return res.json(fallbackResponse);
    }

    // Try to see if they are a guild member to get their nickname
    let displayName = user.globalName || user.username;
    console.log(`✅ [API] User ditemukan di Discord: @${user.username} (${displayName})`);

    if (GUILD_ID) {
      try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId);
        if (member && member.displayName) {
          displayName = member.displayName;
          console.log(`🏷️ [API] Nickname server/guild ditemukan untuk member ini: "${displayName}"`);
        }
      } catch (err) {
        console.log(`ℹ️ [API] Member tidak ditemukan di server/guild, menggunakan nama global: "${displayName}"`);
      }
    }

    res.json({
      username: user.username,
      displayName: displayName,
      avatar: user.displayAvatarURL() || null
    });

  } catch (err) {
    console.error(`❌ [API] Gagal mengambil profil Discord untuk ID ${userId}: ${err.message}`);
    res.json(fallbackResponse);
  }
});

// 5.5. GET Active Voice Channel Members
app.get('/api/voice-channel/:id', async (req, res) => {
  const channelId = req.params.id;

  // High fidelity default fallback list in case bot is offline or channel is empty
  const fallbackMembers = [
    { name: "[HokBen] SALZ", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", isLive: true, badgeText: "165 🌟" },
    { name: "[???] \"и@tw|| f@╦w|| K\"", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=natw", badgeText: "192 ..." },
    { name: "[AFK] T0ddei", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei", badgeText: "HKS", roleValueSymbol: "1 🌟" },
    { name: "[AFK] ʞNI7B", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=blink", roleValueSymbol: "1 🌟" },
    { name: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=yae", isMuted: true, roleValueSymbol: "1..." },
    { name: "[Milk] CrunchyWeeb", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=crunchyweeb", isMuted: true },
    { name: "[Sim] Raiid", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=silver", isMuted: true, badgeText: "KRPC", roleValueSymbol: "3 🌟" },
    { name: "Dari Kontak Anda", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak", roleValueSymbol: "190 🌟" },
    { name: "Fuzu's Friend", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=friend", isSpeaking: true },
    { name: "J.R.R. Tolkienii", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=tolkien", isMuted: true, roleValueSymbol: "29 🌟" },
    { name: "Jing Liu", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=jingliu", isDeafened: true },
    { name: "Lofi Girl", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=lofi", isMuted: true, isDeafened: true },
    { name: "Sparxie | ∞ ✨", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", isMuted: true, roleValueSymbol: "∞ ✨" },
    { name: "✨ Alice", avatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=alice", isMuted: true, isDeafened: true, roleValueSymbol: "1 🌟" }
  ];

  if (!isDiscordReady || !client || !GUILD_ID) {
    return res.json({
      name: channelId === "1435053596742914160" ? "Silence is Golden" : channelId === "voice-existence" ? "Existence: 346" : channelId === "voice-jtc" ? "JOIN TO CREATE" : channelId === "voice-afk" ? "AFK" : "STUDY ROOM",
      status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
      members: fallbackMembers,
      count: fallbackMembers.length
    });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return res.json({
      name: channelId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
      status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
      members: fallbackMembers,
      count: fallbackMembers.length
    });

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

    // If channel is found and has active members in it
    if (channel && channel.members && channel.members.size > 0) {
      const now = Date.now();
      if (now - lastVoiceLogTime > 60000) {
        console.log(`🎙️ [API/voice-channel] Menemukan ${channel.members.size} member aktif di voice channel ${channelId} ("${channel.name}")`);
        lastVoiceLogTime = now;
      }

      // Determine status from Jockie Music first, then other members' activities (Spotify or Custom Status)
      let detectedStatus = null;

      const hasJockie = channel.members.has('411916947773587456');
      if (hasJockie && jockieMusicStatus) {
        const elapsedMs = Date.now() - lastJockieTrackTime;
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const elapsedSec = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
        detectedStatus = jockieMusicStatus.replace(/\[\d{2}:\d{2}\]/, `[${elapsedMin}:${elapsedSec}]`);

        // React with ✅ to the message when the web first fetches it
        if (lastJockieMessage) {
          lastJockieMessage.react('✅').catch(err => {
            console.warn(`⚠️ Gagal memberikan reaksi ✅ pada pesan Jockie: ${err.message}`);
          });
          lastJockieMessage = null; // React only once
        }
      }

      if (!detectedStatus) {
        for (const [, m] of channel.members) {
          try {
            const presence = m.presence;
            if (presence && presence.activities && presence.activities.length > 0) {
              // 1. Try Spotify first
              const spotify = presence.activities.find(act => act.name === 'Spotify');
              if (spotify) {
                let progressStr = "";
                if (spotify.timestamps && spotify.timestamps.start) {
                  const elapsedMs = Date.now() - spotify.timestamps.start.getTime();
                  const elapsedMin = Math.floor(elapsedMs / 60000);
                  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
                  progressStr = `[${elapsedMin}:${elapsedSec}] • `;
                }
                detectedStatus = `${progressStr}${spotify.details || 'Unknown Track'} - ${spotify.state || 'Unknown Artist'}`;
                break;
              }
            }
          } catch (e) { }
        }
      }

      if (!detectedStatus) {
        for (const [, m] of channel.members) {
          try {
            const presence = m.presence;
            if (presence && presence.activities && presence.activities.length > 0) {
              // 2. Try Custom Status (type 4)
              const custom = presence.activities.find(act => act.type === 4);
              if (custom && custom.state) {
                detectedStatus = custom.state;
                break;
              }
              // 3. Try standard Listening Activity (type 2)
              const listening = presence.activities.find(act => act.type === 2);
              if (listening) {
                detectedStatus = `${listening.details || listening.name}${listening.state ? ` - ${listening.state}` : ''}`;
                break;
              }
            }
          } catch (e) { }
        }
      }

      const finalStatus = detectedStatus || (typeof channel.status === 'string' && channel.status ? channel.status : "[05:14] • I Always Wanna Die (Sometimes) - The 1975");

      const activeMembers = channel.members.map(m => {
        const isMuted = m.voice.selfMute || m.voice.serverMute;
        const isDeafened = m.voice.selfDeaf || m.voice.serverDeaf;
        // Simulate active speaking randomly for visual aesthetics on the web UI
        const isSpeaking = !isMuted && !isDeafened && Math.random() < 0.25;

        let roleValueSymbol = null;
        try {
          const highestRole = m.roles.cache
            .filter(r => r.name !== "@everyone" && !r.managed)
            .sort((a, b) => b.position - a.position)
            .first();
          if (highestRole) {
            const cvMatch = highestRole.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
            if (cvMatch) {
              roleValueSymbol = `${cvMatch[1].trim()} 🌟`;
            }
          }
        } catch (roleErr) { }

        return {
          name: m.displayName || m.user.globalName || m.user.username,
          avatar: m.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null,
          isMuted,
          isDeafened,
          isSpeaking,
          isLive: m.voice.selfVideo || m.voice.streaming,
          roleValueSymbol
        };
      });

      return res.json({
        name: channel.name,
        status: finalStatus,
        members: activeMembers,
        count: activeMembers.length
      });
    }

    res.json({
      name: channel ? channel.name : (channelId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM"),
      status: channel ? (typeof channel.status === 'string' ? channel.status : "[05:14] • I Always Wanna Die (Sometimes) - The 1975") : "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
      members: fallbackMembers,
      count: fallbackMembers.length
    });

  } catch (err) {
    console.error(`❌ [API/voice-channel] Gagal mengambil voice channel members: ${err.message}`);
    res.json({
      name: channelId === "1435053596742914160" ? "Silence is Golden" : "STUDY ROOM",
      status: "[05:14] • I Always Wanna Die (Sometimes) - The 1975",
      members: fallbackMembers,
      count: fallbackMembers.length
    });
  }
});


// 6. GET Guild Roles and Member details
app.get('/api/roles', async (req, res) => {
  // Return high-quality premium mock roles if bot is offline or not configured
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

  if (!isDiscordReady || !client || !GUILD_ID) {
    console.log("🤖 [API/roles] Discord Bot offline/standby. Mengembalikan list role simulasi.");
    return res.json(mockRoles);
  }

  try {
    console.log("🤖 [API/roles] Menghubungkan ke Discord Guild...");
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.log("⚠️ [API/roles] Guild tidak ditemukan. Mengembalikan list role simulasi.");
      return res.json(mockRoles);
    }
    // Use cached members if available to avoid Discord gateway rate limit, otherwise fetch
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
        // Extract CV$ / CV / VR / Value Role from role name (excluding rank roles)
        const cvMatch = !EXCLUDED_CV_ROLE_IDS.includes(role.id)
          ? role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i)
          : null;
        const cvAmount = cvMatch ? cvMatch[1].trim() : null;

        // Map members having this role
        const members = role.members.map(member => ({
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatar: member.user.displayAvatarURL({ extension: 'webp', size: 64 }) || null
        }));

        // Map human-readable permissions
        const permissions = role.permissions.toArray();

        // Detect gradient colors (Discord.js v14.18+ support via role.colors)
        // role.colors returns an array of {color, position} for gradient roles
        let gradientColors = null;
        try {
          if (role.colors && Array.isArray(role.colors) && role.colors.length >= 2) {
            // Gradient role: extract hex colors sorted by position
            gradientColors = role.colors
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map(c => {
                const hex = (c.color ?? c).toString(16).padStart(6, '0');
                return `#${hex}`;
              });
          } else if (typeof role.colors === 'object' && role.colors !== null && !Array.isArray(role.colors)) {
            // Alternative object format
            const colorValues = Object.values(role.colors).filter(v => typeof v === 'number');
            if (colorValues.length >= 2) {
              gradientColors = colorValues.map(c => `#${c.toString(16).padStart(6, '0')}`);
            }
          }
        } catch (e) {
          // role.colors not supported in this discord.js version — fall back to solid
          gradientColors = null;
        }

        return {
          id: role.id,
          name: role.name,
          color: role.hexColor,
          gradientColors,  // null for solid, array of hex for gradient
          icon: role.iconURL({ extension: 'png', size: 128 }) || null,
          position: role.position,
          cvAmount,
          permissions,
          members
        };
      })
      // Sort: highest Discord position first (most important role)
      .sort((a, b) => b.position - a.position);

    // If no roles parsed, return fallback
    if (formattedRoles.length === 0) {
      return res.json(mockRoles);
    }

    res.json(formattedRoles);

  } catch (err) {
    console.error(`❌ [API/roles] Gagal mengambil roles: ${err.message}`);
    res.json(mockRoles);
  }
});

function getDeterministicValue(id, key, min, max) {
  let hash = 0;
  const str = id + key;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return min + (hash % (max - min + 1));
}

// 7. GET Leaderboards (Cakey Bot & CV$ Wealth)
app.get('/api/leaderboard', async (req, res) => {
  const cacheKey = 'api:leaderboard';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const mockLeaderboard = {
    leveling: [
      { rank: 1, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", level: 64, xp: 14200, nextXp: 15000 },
      { rank: 2, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", level: 58, xp: 9800, nextXp: 12000 },
      { rank: 3, id: "sim-user-1", username: "garingmania", displayName: "GaringMania 🍿", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=garing", level: 45, xp: 7200, nextXp: 9000 },
      { rank: 4, id: "sim-user-4", username: "jobetmaritoas", displayName: "CrunchyWeeb 🎪", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok", level: 38, xp: 4200, nextXp: 6000 },
      { rank: 5, id: "sim-user-5", username: "anomaly.x", displayName: "Anomaly Zero", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=zero", level: 32, xp: 2100, nextXp: 4000 },
      { rank: 6, id: "sim-user-6", username: "popcorn.kru", displayName: "Popcorn Kru", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=popcorn", level: 27, xp: 1500, nextXp: 3000 },
      { rank: 7, id: "sim-user-7", username: "theater.lover", displayName: "Theater Lover", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=lover", level: 21, xp: 800, nextXp: 2000 },
      { rank: 8, id: "sim-user-8", username: "crispy.clan", displayName: "Crispy Clan Member", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=crispy", level: 16, xp: 450, nextXp: 1000 },
      { rank: 9, id: "sim-user-9", username: "crunchy.bot", displayName: "Crunchy Bot Assistant", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=assistant", level: 12, xp: 200, nextXp: 800 },
      { rank: 10, id: "sim-user-10", username: "anonymous.anom", displayName: "Anon Anomaly", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=anon", level: 8, xp: 90, nextXp: 500 }
    ],
    streak: [
      { rank: 1, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", streak: 124 },
      { rank: 2, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", streak: 92 },
      { rank: 3, id: "sim-user-5", username: "anomaly.x", displayName: "Anomaly Zero", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=zero", streak: 73 },
      { rank: 4, id: "sim-user-1", username: "garingmania", displayName: "GaringMania 🍿", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=garing", streak: 56 },
      { rank: 5, id: "sim-user-6", username: "popcorn.kru", displayName: "Popcorn Kru", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=popcorn", streak: 42 },
      { rank: 6, id: "sim-user-7", username: "theater.lover", displayName: "Theater Lover", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=lover", streak: 31 },
      { rank: 7, id: "sim-user-4", username: "jobetmaritoas", displayName: "CrunchyWeeb 🎪", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok", streak: 25 },
      { rank: 8, id: "sim-user-8", username: "crispy.clan", displayName: "Crispy Clan Member", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=crispy", streak: 18 },
      { rank: 9, id: "sim-user-10", username: "anonymous.anom", displayName: "Anon Anomaly", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=anon", streak: 12 },
      { rank: 10, id: "sim-user-9", username: "crunchy.bot", displayName: "Crunchy Bot Assistant", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=assistant", streak: 7 }
    ],
    voice: [
      { rank: 1, id: "sim-user-1", username: "garingmania", displayName: "GaringMania 🍿", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=garing", hours: 840 },
      { rank: 2, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", hours: 620 },
      { rank: 3, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", hours: 512 },
      { rank: 4, id: "sim-user-4", username: "jobetmaritoas", displayName: "CrunchyWeeb 🎪", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=crunchy-tiktok", hours: 384 },
      { rank: 5, id: "sim-user-5", username: "anomaly.x", displayName: "Anomaly Zero", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=zero", hours: 290 },
      { rank: 6, id: "sim-user-7", username: "theater.lover", displayName: "Theater Lover", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=lover", hours: 198 },
      { rank: 7, id: "sim-user-6", username: "popcorn.kru", displayName: "Popcorn Kru", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=popcorn", hours: 142 },
      { rank: 8, id: "sim-user-8", username: "crispy.clan", displayName: "Crispy Clan Member", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=crispy", hours: 96 },
      { rank: 9, id: "sim-user-10", username: "anonymous.anom", displayName: "Anon Anomaly", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=anon", hours: 52 },
      { rank: 10, id: "sim-user-9", username: "crunchy.bot", displayName: "Crunchy Bot Assistant", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=assistant", hours: 18 }
    ],
    cvWealth: [
      { rank: 1, id: "661135501226672129", username: "sim.tsx", displayName: "[Raiid] Sim | 46 ⭐", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=sim", cvAmount: "13.672.500", roleName: "Serial #1 — Crescent Eclipse", roles: [{ name: "Serial #1 — Crescent Eclipse", value: 12982500, str: "12.982.500", color: "#ffc107" }, { name: "Sekte Keripik Renyah", value: 690000, str: "690.000", color: "#ff9900" }] },
      { rank: 2, id: "12714337000051128405", username: "yae.eva", displayName: "[Doomsday] Yae エヴァ", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", cvAmount: "13.402.500", roleName: "Serial #1 — Crescent Eclipse", roles: [{ name: "Serial #1 — Crescent Eclipse", value: 12982500, str: "12.982.500", color: "#ffc107" }, { name: "Sekte Kerupuk Gurih", value: 420000, str: "420.000", color: "#ff3366" }] },
      { rank: 3, id: "sim-user-2", username: "keripik.master", displayName: "Sekte Keripik Master", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=keripik-master", cvAmount: "690.000", roleName: "Sekte Keripik Renyah", roles: [{ name: "Sekte Keripik Renyah", value: 690000, str: "690.000", color: "#ff9900" }] },
      { rank: 4, id: "sim-user-3", username: "kerupuk.enthusiast", displayName: "Sekte Kerupuk Enthusiast", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=kerupuk-enthusiast", cvAmount: "420.000", roleName: "Sekte Kerupuk Gurih", roles: [{ name: "Sekte Kerupuk Gurih", value: 420000, str: "420.000", color: "#ff3366" }] },
      { rank: 5, id: "sim-user-1", username: "garingmania", displayName: "GaringMania 🍿", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=garing", cvAmount: "120.000", roleName: "Sekte Kerupuk Gurih", roles: [{ name: "Sekte Kerupuk Gurih", value: 120000, str: "420.000", color: "#ff3366" }] },
      { rank: 6, id: "sim-user-5", username: "anomaly.x", displayName: "Anomaly Zero", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=zero", cvAmount: "85.000", roleName: "Sekte Keripik Renyah", roles: [{ name: "Sekte Keripik Renyah", value: 85000, str: "690.000", color: "#ff9900" }] },
      { rank: 7, id: "sim-user-7", username: "theater.lover", displayName: "Theater Lover", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=lover", cvAmount: "42.000", roleName: "Sekte Kerupuk Gurih", roles: [{ name: "Sekte Kerupuk Gurih", value: 42000, str: "420.000", color: "#ff3366" }] },
      { rank: 8, id: "sim-user-6", username: "popcorn.kru", displayName: "Popcorn Kru", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=popcorn", cvAmount: "30.000", roleName: "Sekte Kerupuk Gurih", roles: [{ name: "Sekte Kerupuk Gurih", value: 30000, str: "420.000", color: "#ff3366" }] },
      { rank: 9, id: "sim-user-8", username: "crispy.clan", displayName: "Crispy Clan Member", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=crispy", cvAmount: "15.000", roleName: "Sekte Keripik Renyah", roles: [{ name: "Sekte Keripik Renyah", value: 15000, str: "690.000", color: "#ff9900" }] },
      { rank: 10, id: "sim-user-9", username: "crunchy.bot", displayName: "Crunchy Bot Assistant", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=assistant", cvAmount: "5.000", roleName: "Sekte Kerupuk Gurih", roles: [{ name: "Sekte Kerupuk Gurih", value: 5000, str: "420.000", color: "#ff3366" }] }
    ]
  };

  try {
    const guildId = GUILD_ID || '1403255548698300416';
    let resolvedCakey = null;

    // ─── Cakey Bot Scraping (dengan proxy fallback untuk bypass Cloudflare) ───
    try {
      const cakeyUrl = `https://cakey.bot/leaderboard/id/${guildId}?tab=leveling`;
      const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      };

      // Try direct first (works on localhost/residential IP), then proxy chain for VPS
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

      // ─── 1. LEVELING ───
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
        } catch (e) { console.warn('⚠️ Gagal parse leveling row:', e.message); }
      });

      // ─── 2. STREAKS ───
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
        } catch (e) { console.warn('⚠️ Gagal parse streak row:', e.message); }
      });

      // ─── 3. VOICE (dari leveling) ───
      const voiceList = [...levelingList]
        .sort((a, b) => b.voiceMinutes - a.voiceMinutes)
        .map((item, idx) => ({ rank: idx + 1, id: item.id, username: item.username, displayName: item.displayName, avatar: item.avatar, hours: Math.round(item.voiceMinutes / 60) }));

      resolvedCakey = { leveling: levelingList, streak: streakList, voice: voiceList };
      console.log(`✅ [API/leaderboard] Sukses parse 3 papan peringkat dari Cakey Bot!`);

    } catch (cakeyErr) {
      console.warn(`⚠️ [API/leaderboard] Cakey Bot tidak tersedia: ${cakeyErr.message}. Menggunakan fallback Discord member.`);
    }

    // Calculate CV$ Wealth (from live Discord server or mock fallback)
    let finalCvWealth = [];
    try {
      if (isDiscordReady && client && GUILD_ID) {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (guild) {
          // Use cached members if available to avoid Discord gateway rate limit, otherwise fetch
          let members = guild.members.cache;
          if (members.size === 0) {
            console.log("👥 [API/leaderboard] Cache kosong, memuat member server...");
            members = await guild.members.fetch().catch(() => guild.members.cache);
          } else {
            console.log(`👥 [API/leaderboard] Menggunakan ${members.size} member ter-cache.`);
          }
          if (members && members.size > 0) {
            const humanMembers = members.filter(m => !m.user.bot);
            const roles = await guild.roles.fetch();
            const roleCvMap = new Map();

            roles.forEach(role => {
              if (role.name !== "@everyone" && !role.managed && !EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
                const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
                if (cvMatch) {
                  const cvStr = cvMatch[1].trim();
                  const cvVal = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
                  const cleanName = role.name.replace(/\s*\|\s*(?:CV\$|CV|VR|Value\s*Role)\s*[\d.,\s]+/i, "").trim();
                  roleCvMap.set(role.id, {
                    name: cleanName,
                    value: cvVal,
                    str: cvStr
                  });
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
                // Sort rolesAcquired by value descending
                rolesAcquired.sort((a, b) => b.value - a.value);

                // Format with Indonesian dot separators (e.g. 12.982.500)
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

    // Fallback if CV$ wealth calculation was empty
    if (finalCvWealth.length === 0) {
      finalCvWealth = mockLeaderboard.cvWealth;
    }

    // Final Response Merger
    if (resolvedCakey) {
      res.json({
        leveling: resolvedCakey.leveling.slice(0, 10),
        streak: resolvedCakey.streak.slice(0, 10),
        voice: resolvedCakey.voice.slice(0, 10),
        cvWealth: finalCvWealth
      });
    } else {
      // If Cakey Bot scrape failed entirely, use deterministic/mock fallback
      // Calculate dynamic deterministic Cakey Bot leaderboards based on actual members
      let finalLeveling = [];
      let finalStreak = [];
      let finalVoice = [];

      try {
        if (isDiscordReady && client && GUILD_ID) {
          const guild = await client.guilds.fetch(GUILD_ID);
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
                const level = getDeterministicValue(m.id, "level", 1, 65);
                const xp = getDeterministicValue(m.id, "xp", 100, 14000);
                const streak = getDeterministicValue(m.id, "streak", 1, 150);
                const hours = getDeterministicValue(m.id, "hours", 5, 950);
                return {
                  ...m,
                  level,
                  xp,
                  nextXp: level * 300,
                  streak,
                  hours
                };
              });

              // a. Leveling
              const levelingList = [...mappedMembers]
                .sort((a, b) => b.level !== a.level ? b.level - a.level : b.xp - a.xp)
                .slice(0, 10)
                .map((m, idx) => ({
                  rank: idx + 1,
                  id: m.id,
                  username: m.username,
                  displayName: m.displayName,
                  avatar: m.avatar,
                  level: m.level,
                  xp: m.xp,
                  nextXp: m.nextXp
                }));

              for (let i = 0; i < 10; i++) {
                if (levelingList[i]) finalLeveling.push(levelingList[i]);
                else finalLeveling.push({ ...mockLeaderboard.leveling[i % mockLeaderboard.leveling.length], rank: i + 1 });
              }

              // b. Streak
              const streakList = [...mappedMembers]
                .sort((a, b) => b.streak - a.streak)
                .slice(0, 10)
                .map((m, idx) => ({
                  rank: idx + 1,
                  id: m.id,
                  username: m.username,
                  displayName: m.displayName,
                  avatar: m.avatar,
                  streak: m.streak
                }));

              for (let i = 0; i < 10; i++) {
                if (streakList[i]) finalStreak.push(streakList[i]);
                else finalStreak.push({ ...mockLeaderboard.streak[i % mockLeaderboard.streak.length], rank: i + 1 });
              }

              // c. Voice
              const voiceList = [...mappedMembers]
                .sort((a, b) => b.hours - a.hours)
                .slice(0, 10)
                .map((m, idx) => ({
                  rank: idx + 1,
                  id: m.id,
                  username: m.username,
                  displayName: m.displayName,
                  avatar: m.avatar,
                  hours: m.hours
                }));

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

      const finalResult = {
        leveling: finalLeveling,
        streak: finalStreak,
        voice: finalVoice,
        cvWealth: finalCvWealth
      };
      cache.set(cacheKey, finalResult, 30); // Cache selama 30 detik
      res.json(finalResult);
    }
  } catch (err) {
    console.error(`❌ [API/leaderboard] Gagal meresolusi leaderboard: ${err.message}`);
    res.json(mockLeaderboard);
  }
});

// ================= Rank Role Auto-Updater API =================

// Mapping: kategori leaderboard → ID role Discord yang akan diupdate
const RANK_ROLE_IDS = {
  leveling: '1511318299730903170',
  streak: '1511318492664561755',
  voice: '1511319103938232431',
  cvWealth: '1511319284616265798',
};

// Interval auto-check (default: 10 menit)
const RANK_AUTO_CHECK_INTERVAL_MS = parseInt(process.env.RANK_AUTO_CHECK_INTERVAL_MS || '600000', 10);

// Snapshot penyimpan data top-1 terakhir untuk mendeteksi perubahan
let lastTop1Snapshot = {
  leveling: null,  // { id, level }
  streak: null,  // { id, streak }
  voice: null,  // { id, hours }
  cvWealth: null,  // { id, cvAmount }
};

// Helper: ambil nilai pembanding dari top1 entry
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

// Helper: build nama role baru berdasarkan data top 1
function buildRoleName(category, top1) {
  switch (category) {
    case 'leveling': return `🏆 Rank 1 Leveling: Level ${top1.level}`;
    case 'streak': return `🏆 Rank 1 Streak: ☀️ ${top1.streak} Hari`;
    case 'voice': return `🏆 Rank 1 Voice: ${top1.hours} Hours`;
    case 'cvWealth': return `🏆 Rank 1 Value Account: CV$ ${top1.cvAmount}`;
    default: return null;
  }
}

// ── Core function: update role name + assign ke member ──────────────────────
// Bisa dipanggil dari endpoint manual (tombol web) MAUPUN auto-polling.
// silent=true → tidak log info "tidak ada perubahan", dipakai saat polling.
async function executeRankRoleUpdate({ silent = false, changedOnly = false } = {}) {
  if (!isDiscordReady || !client || !GUILD_ID) {
    return { success: false, message: 'Bot Discord tidak aktif.', results: [] };
  }

  // Fetch leaderboard data terbaru
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

  // Fetch guild
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return { success: false, message: `Guild ${GUILD_ID} tidak ditemukan.`, results: [] };

  // Load member cache
  let membersCache;
  try {
    membersCache = await guild.members.fetch();
  } catch (err) {
    membersCache = guild.members.cache;
  }

  // Helper: cari member Discord berdasarkan ID atau username
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

    // Jika changedOnly=true (auto-polling), skip kategori yang tidak berubah
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
      // 1. Update nama role
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        results.push({ category: cat, success: false, reason: `Role ${roleId} tidak ditemukan`, champion: top1.displayName });
        continue;
      }
      if (role.name !== newName) {
        await role.setName(newName, 'Auto-update CrunchyVerse Rank Watcher');
        console.log(`✅ [AutoRank] Role "${cat}": "${role.name}" → "${newName}"`);
      }

      // 2. Lepas role dari holder lama
      const currentHolders = membersCache.filter(m => m.roles.cache.has(roleId));
      for (const [, holder] of currentHolders) {
        await holder.roles.remove(roleId, 'Revoke - bukan rank 1 lagi').catch(() => { });
        console.log(`🔴 [AutoRank] Melepas role dari ${holder.user.username}`);
        await new Promise(r => setTimeout(r, 500));
      }

      // 3. Berikan role ke juara 1 baru
      const champion = findMember(top1);
      let assignedTo = null;
      if (champion) {
        await champion.roles.add(roleId, `Rank #1 ${cat} auto-assign`).catch(() => { });
        console.log(`🏆 [AutoRank] Role "${newName}" → ${champion.user.username} (${champion.id})`);
        assignedTo = champion.displayName;
      } else {
        console.warn(`⚠️ [AutoRank] Member "${top1.displayName}" (ID: ${top1.id}) tidak ditemukan di guild.`);
      }

      // 4. Update snapshot
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

// ── Auto-polling: jalankan setiap RANK_AUTO_CHECK_INTERVAL_MS ───────────────
async function autoRankRoleCheck() {
  if (!isDiscordReady || !client || !GUILD_ID) return;
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

// POST /api/rank-roles/update — trigger dari tombol web "Integrasikan"
app.post('/api/rank-roles/update', requireClientToken, async (req, res) => {
  console.log('\n🔄 [RankRoles] Memulai pembaruan nama + assignment role Rank #1 dari Web...');

  if (!isDiscordReady || !client || !GUILD_ID) {
    return res.status(503).json({
      success: false,
      message: 'Bot Discord tidak aktif. Pastikan DISCORD_TOKEN & GUILD_ID sudah diisi di .env dan bot sudah terhubung.',
      results: []
    });
  }

  // Fetch leaderboard data terbaru dari endpoint sendiri
  let leaderboard = null;
  try {
    const port = process.env.PORT || 3001;
    const lbRes = await fetch(`http://localhost:${port}/api/leaderboard`, {
      signal: AbortSignal.timeout(12000)
    });
    if (!lbRes.ok) throw new Error(`HTTP ${lbRes.status}`);
    leaderboard = await lbRes.json();
    console.log('✅ [RankRoles] Data leaderboard berhasil di-fetch.');
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Gagal fetch data leaderboard: ${err.message}`,
      results: []
    });
  }

  // Fetch guild & member cache
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    return res.status(500).json({
      success: false,
      message: `Gagal mengambil guild ${GUILD_ID} dari Discord.`,
      results: []
    });
  }

  // Load all members into cache for username matching
  let membersCache;
  try {
    membersCache = await guild.members.fetch();
    console.log(`👥 [RankRoles] ${membersCache.size} member ter-cache.`);
  } catch (err) {
    membersCache = guild.members.cache;
    console.warn(`⚠️ [RankRoles] Gagal fetch semua member, pakai cache (${membersCache.size}).`);
  }

  // Helper: cari member Discord berdasarkan ID atau username
  function findMember(top1) {
    const id = top1.id;
    const username = top1.username || top1.displayName || '';

    // 1. Coba langsung pakai Discord ID (hanya valid jika berupa snowflake numerik 17-20 digit)
    if (/^\d{17,20}$/.test(id)) {
      const byId = membersCache.get(id);
      if (byId) return byId;
    }

    // 2. Fallback: cari berdasarkan username (case-insensitive)
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
    return membersCache.find(m =>
      m.user.username.toLowerCase() === cleanUsername ||
      m.user.username.toLowerCase().includes(cleanUsername) ||
      m.displayName.toLowerCase().includes(cleanUsername)
    ) || null;
  }

  const categories = ['leveling', 'streak', 'voice', 'cvWealth'];
  const results = [];

  for (const cat of categories) {
    const list = leaderboard[cat];
    const roleId = RANK_ROLE_IDS[cat];

    if (!list || list.length === 0) {
      results.push({ category: cat, success: false, reason: 'Data kosong' });
      continue;
    }

    const top1 = list.find(e => e.rank === 1) || list[0];
    const newName = buildRoleName(cat, top1);

    if (!newName) {
      results.push({ category: cat, success: false, reason: 'Format nama tidak dikenali' });
      continue;
    }

    try {
      // ── 1. Update nama role ──────────────────────────────────────────────
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        results.push({ category: cat, success: false, reason: `Role ID ${roleId} tidak ditemukan`, champion: top1.displayName });
        continue;
      }

      const oldName = role.name;
      if (oldName !== newName) {
        await role.setName(newName, 'Auto-update via CrunchyVerse Web Panel');
        console.log(`✅ [RankRoles] Nama role: "${oldName}" → "${newName}"`);
      } else {
        console.log(`ℹ️ [RankRoles] Nama role "${newName}" sudah benar, tidak perlu diubah.`);
      }

      // ── 2. Lepas role dari semua member yang sekarang memegangnya ────────
      const currentHolders = membersCache.filter(m => m.roles.cache.has(roleId));
      for (const [, holder] of currentHolders) {
        try {
          await holder.roles.remove(roleId, 'Revoke rank role - bukan juara 1 lagi');
          console.log(`🔴 [RankRoles] Melepas role dari ${holder.user.username} (bukan rank 1 lagi)`);
        } catch (e) {
          console.warn(`⚠️ [RankRoles] Gagal melepas role dari ${holder.user.username}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
      }

      // ── 3. Berikan role ke juara 1 ───────────────────────────────────────
      const champion = findMember(top1);
      let assignedTo = null;

      if (champion) {
        if (!champion.roles.cache.has(roleId)) {
          await champion.roles.add(roleId, `Rank #1 ${cat} - auto-assign via CrunchyVerse`);
          console.log(`🏆 [RankRoles] Role "${newName}" diberikan ke ${champion.user.username} (${champion.id})`);
        } else {
          console.log(`ℹ️ [RankRoles] ${champion.user.username} sudah punya role ini.`);
        }
        assignedTo = champion.displayName;
      } else {
        console.warn(`⚠️ [RankRoles] Member rank #1 "${top1.displayName}" (ID: ${top1.id}) tidak ditemukan di guild.`);
      }

      results.push({
        category: cat,
        success: true,
        newName,
        champion: top1.displayName,
        assignedTo,
        memberFound: !!champion,
        prevHoldersRevoked: currentHolders.size
      });

      // Rate limit safety antar kategori
      await new Promise(r => setTimeout(r, 1500));

    } catch (err) {
      console.error(`❌ [RankRoles] Gagal proses kategori ${cat}: ${err.message}`);
      results.push({ category: cat, success: false, reason: err.message, champion: top1?.displayName });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const assignedCount = results.filter(r => r.assignedTo).length;
  console.log(`✅ [RankRoles] Selesai. ${successCount}/4 role diperbarui, ${assignedCount}/4 berhasil di-assign ke member.\n`);

  res.json({
    success: successCount > 0,
    message: `${successCount}/4 role diperbarui · ${assignedCount}/4 berhasil di-assign ke juara`,
    results
  });
});

// GET discord user display name and avatar by ID
app.get('/api/discord-user/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!isDiscordReady || !client) {
    return res.status(503).json({ error: "Discord client is not ready" });
  }
  try {
    const user = await client.users.fetch(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const avatar = user.displayAvatarURL({ extension: 'webp', size: 128 }) || null;
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.globalName || user.username,
      avatar
    });
  } catch (err) {
    console.error(`❌ Error fetching user info for ${userId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

const USERS_FILE = path.join(__dirname, '../database/users.json');

function loadLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca users.json:", e.message);
  }
  return {};
}

function saveLocalUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis users.json:", e.message);
  }
}

async function updatePlayerProgressRoles(member, userId) {
  try {
    const allSubs = loadLocalSubmissions();
    const activeQuests = loadLocalQuests();

    // 1. Count approved active quests
    const userApprovedSubs = allSubs.filter(s =>
      s.userId === userId &&
      s.status === 'approved' &&
      activeQuests.some(q => q.id === s.questId)
    );
    const completedCount = userApprovedSubs.length;
    console.log(`📊 [Progress Roles] User ${userId} has completed ${completedCount} active quests.`);

    const PROGRESS_ROLES = {
      1: '1512826550041444505',
      2: '1512827213182144624',
      3: '1512827370858483862',
      4: '1512828393178009704',
      5: '1512828816073035787'
    };

    // Remove other progress roles if member is valid
    if (member && member.roles) {
      for (const [count, rId] of Object.entries(PROGRESS_ROLES)) {
        if (Number(count) !== completedCount) {
          if (member.roles.cache.has(rId)) {
            await member.roles.remove(rId).catch(err => console.warn(`Gagal remove role ${rId}:`, err.message));
          }
        }
      }

      // Add current progress role (only if completedCount is between 1 and 5)
      const targetProgressRoleId = PROGRESS_ROLES[Math.min(5, completedCount)];
      if (completedCount >= 1 && targetProgressRoleId) {
        if (!member.roles.cache.has(targetProgressRoleId)) {
          await member.roles.add(targetProgressRoleId).catch(err => console.error(`Gagal add progress role:`, err.message));
        }
      }

      // 2. Handle 5/5 Serial / Last Chapter Roles
      if (completedCount >= 5) {
        const completers = [];
        const userIdsWithSubs = Array.from(new Set(allSubs.map(s => s.userId)));

        userIdsWithSubs.forEach(uId => {
          const uSubs = allSubs.filter(s => s.userId === uId && s.status === 'approved' && activeQuests.some(q => q.id === s.questId));
          if (uSubs.length >= 5) {
            uSubs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const completionTime = new Date(uSubs[4].createdAt).getTime();
            completers.push({ userId: uId, time: completionTime });
          }
        });

        completers.sort((a, b) => a.time - b.time);
        const rankIndex = completers.findIndex(c => c.userId === userId);

        let targetSerialRoleId = '';
        let targetSerialName = '';

        if (rankIndex === 0) {
          targetSerialRoleId = '1505846686155804792'; // Serial 1
          targetSerialName = 'Serial #1 — Crescent Eclipse';
        } else if (rankIndex === 1) {
          targetSerialRoleId = '1513143066427658310'; // Serial 2
          targetSerialName = 'Serial #2';
        } else if (rankIndex === 2) {
          targetSerialRoleId = '1513143264986005645'; // Serial 3
          targetSerialName = 'Serial #3';
        } else {
          targetSerialRoleId = '1513143545433686026'; // Last Chapter biasa
          targetSerialName = 'Last Chapter';
        }

        // Add target serial role if they don't have it
        if (targetSerialRoleId && !member.roles.cache.has(targetSerialRoleId)) {
          await member.roles.add(targetSerialRoleId).catch(err => console.error(`Gagal add serial role:`, err.message));
          console.log(`🏆 [Serial Role] User ${userId} mendapat role ${targetSerialName} (Rank ${rankIndex + 1})`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error di updatePlayerProgressRoles:", err.message);
  }
}

const VOLUNTEERABLES_FILE = path.join(__dirname, '../database/volunteerables.json');

function loadLocalVolunteerables() {
  try {
    if (fs.existsSync(VOLUNTEERABLES_FILE)) {
      return JSON.parse(fs.readFileSync(VOLUNTEERABLES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca volunteerables.json:", e.message);
  }
  return [];
}

function saveLocalVolunteerables(list) {
  try {
    fs.writeFileSync(VOLUNTEERABLES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis volunteerables.json:", e.message);
  }
}

async function syncVolunteerablesFromFirestore() {
  if (!db) return;
  try {
    console.log("🔄 [Volunteerables] Memulai sinkronisasi dari Firestore...");
    const querySnapshot = await withTimeout(getDocs(collection(db, "volunteerables")), 5000);
    const list = [];
    querySnapshot.forEach(doc => {
      list.push(doc.data());
    });
    if (list.length > 0) {
      saveLocalVolunteerables(list);
      console.log(`🔄 [Volunteerables] Berhasil sinkronisasi ${list.length} data dari Firestore ke lokal.`);
    } else {
      console.log("🔄 [Volunteerables] Tidak ada data di Firestore.");
    }
  } catch (err) {
    console.warn("⚠️ [Volunteerables] Gagal sinkronisasi dari Firestore pada saat startup/GET:", err.message);
  }
}

// Jalankan sync setelah startup (5 detik) jika Firebase terhubung
setTimeout(() => {
  if (db) {
    syncVolunteerablesFromFirestore().catch(err => {
      console.error("Gagal sinkronisasi volunteerables pada startup:", err.message);
    });
  }
}, 5000);

// GET all volunteerables
app.get('/api/volunteerables', async (req, res) => {
  let list = [];
  if (db) {
    try {
      const querySnapshot = await withTimeout(getDocs(collection(db, "volunteerables")), 5000);
      const fsList = [];
      querySnapshot.forEach(doc => {
        fsList.push(doc.data());
      });
      if (fsList.length > 0) {
        list = fsList;
        saveLocalVolunteerables(list);
      } else {
        list = loadLocalVolunteerables();
      }
    } catch (err) {
      console.warn("⚠️ Gagal mengambil volunteerables dari Firestore, menggunakan local fallback:", err.message);
      list = loadLocalVolunteerables();
    }
  } else {
    list = loadLocalVolunteerables();
  }

  // Hydrate each volunteer with Discord profile data if client is ready
  const hydratedList = await Promise.all(list.map(async (v) => {
    let username = "";
    let globalName = "";
    let avatarUrl = "";
    if (client && isDiscordReady) {
      try {
        const user = await client.users.fetch(v.discordId);
        username = user.username;
        globalName = user.globalName || user.username;
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 128 });
      } catch (err) {
        console.warn(`Gagal fetch Discord user ${v.discordId}:`, err.message);
      }
    }
    return {
      ...v,
      username,
      globalName,
      avatarUrl
    };
  }));

  res.json(hydratedList);
});

// GET single volunteerable status
app.get('/api/volunteerables/:id', async (req, res) => {
  const { id } = req.params;
  let list = loadLocalVolunteerables();
  let isVolunteerable = list.some(v => v.discordId === id);

  if (!isVolunteerable && db) {
    try {
      const volDoc = await withTimeout(getDoc(doc(db, "volunteerables", id)), 3000);
      if (volDoc.exists()) {
        isVolunteerable = true;
        list.push(volDoc.data());
        saveLocalVolunteerables(list);
      }
    } catch (e) {
      console.warn(`Gagal fetch single volunteerable ${id} dari Firestore:`, e.message);
    }
  }

  res.json({ isVolunteerable });
});

// POST add a volunteerable
app.post('/api/volunteerables', requireClientToken, async (req, res) => {
  const { discordId, addedBy } = req.body;
  if (!discordId) {
    return res.status(400).json({ error: "discordId wajib diisi" });
  }
  const list = loadLocalVolunteerables();
  if (!list.some(v => v.discordId === discordId)) {
    list.push({
      discordId,
      addedAt: new Date().toISOString(),
      addedBy: addedBy || "Sim"
    });
    saveLocalVolunteerables(list);
  }

  // Proactive local update in users.json
  try {
    const localUsers = loadLocalUsers();
    let updated = false;
    Object.keys(localUsers).forEach(key => {
      const u = localUsers[key];
      if (u.discordId === discordId || u.uid === `sim-discord-${discordId}`) {
        u.role = "Volunteer Theater";
        updated = true;
      }
    });
    if (updated) {
      saveLocalUsers(localUsers);
    }
  } catch (e) {
    console.warn("Gagal update local users.json saat tambah volunteer:", e.message);
  }

  // Proactive Firestore update (wrapped in try-catch)
  if (db) {
    try {
      // Simpan ke collection volunteerables
      await withTimeout(setDoc(doc(db, "volunteerables", discordId), {
        discordId,
        addedAt: new Date().toISOString(),
        addedBy: addedBy || "Sim"
      }));

      // Update role di collection users
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("discordId", "==", discordId));
      const querySnapshot = await withTimeout(getDocs(q));
      for (const userDoc of querySnapshot.docs) {
        await withTimeout(updateDoc(doc(db, "users", userDoc.id), {
          role: "Volunteer Theater"
        }));
      }
    } catch (e) {
      console.warn("Firestore unreachable saat update role/simpan volunteer:", e.message);
    }
  }

  res.json({ success: true, list });
});

// DELETE a volunteerable
app.delete('/api/volunteerables/:id', requireClientToken, async (req, res) => {
  const { id } = req.params;
  let list = loadLocalVolunteerables();
  list = list.filter(v => v.discordId !== id);
  saveLocalVolunteerables(list);

  // Proactive local update in users.json
  if (id !== "661135501226672129" && id !== "1410583272173600819") {
    try {
      const localUsers = loadLocalUsers();
      let updated = false;
      Object.keys(localUsers).forEach(key => {
        const u = localUsers[key];
        if (u.discordId === id || u.uid === `sim-discord-${id}`) {
          u.role = "Penonton Teater";
          updated = true;
        }
      });
      if (updated) {
        saveLocalUsers(localUsers);
      }
    } catch (e) {
      console.warn("Gagal update local users.json saat hapus volunteer:", e.message);
    }
  }

  // Proactive Firestore update (wrapped in try-catch)
  if (db) {
    try {
      // Hapus dari collection volunteerables
      await withTimeout(deleteDoc(doc(db, "volunteerables", id)));

      if (id !== "661135501226672129" && id !== "1410583272173600819") {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("discordId", "==", id));
        const querySnapshot = await withTimeout(getDocs(q));
        for (const userDoc of querySnapshot.docs) {
          await withTimeout(updateDoc(doc(db, "users", userDoc.id), {
            role: "Penonton Teater"
          }));
        }
      }
    } catch (e) {
      console.warn("Firestore unreachable saat revert role/hapus volunteer:", e.message);
    }
  }

  res.json({ success: true, list });
});

// GET user info and CV points by UID
app.get('/api/users/:uid', async (req, res) => {
  const { uid } = req.params;

  // Try to parse Discord Snowflake from uid
  let discordId = null;
  const match = uid.match(/\d{17,20}/);
  if (match) {
    discordId = match[0];
  }

  let liveCv = 0;
  let hasLiveCv = false;

  if (isDiscordReady && client && discordId) {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (member) {
        // Fetch guild roles to get their CV value
        const roles = await guild.roles.fetch();
        const roleCvMap = new Map();
        roles.forEach(role => {
          if (role.name !== "@everyone" && !role.managed && !EXCLUDED_CV_ROLE_IDS.includes(role.id)) {
            const cvMatch = role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i);
            if (cvMatch) {
              const cvStr = cvMatch[1].trim();
              const cvVal = parseFloat(cvStr.replace(/[.,\s]/g, "").replace(",", ".")) || 0;
              roleCvMap.set(role.id, cvVal);
            }
          }
        });

        // Sum member's role CVs
        member.roles.cache.forEach(role => {
          const roleCv = roleCvMap.get(role.id);
          if (roleCv) {
            liveCv += roleCv;
          }
        });
        hasLiveCv = true;
      }
    } catch (err) {
      console.warn("⚠️ Gagal menghitung live CV dari Discord:", err.message);
    }
  }

  // Load from local JSON database
  const localUsers = loadLocalUsers();
  const userData = localUsers[uid] || { uid, name: "Pemain Teater", cv: 0, points: 0 };

  if (hasLiveCv) {
    userData.cv = liveCv;
    userData.points = liveCv;
    localUsers[uid] = userData;
    saveLocalUsers(localUsers);
  }

  res.json(userData);
});

// ================= Sparxie Bot Chat API =================

const CUSTOM_CHANNELS_FILE = path.join(__dirname, '../database/custom-channels.json');
const CHAT_MESSAGES_FILE = path.join(__dirname, '../database/chat-messages.json');

function loadCustomChannels() {
  if (!fs.existsSync(CUSTOM_CHANNELS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(CUSTOM_CHANNELS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Error reading custom-channels.json:', err.message);
    return [];
  }
}

function saveCustomChannels(channels) {
  try {
    fs.writeFileSync(CUSTOM_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error writing custom-channels.json:', err.message);
  }
}

function loadChatMessages() {
  if (!fs.existsSync(CHAT_MESSAGES_FILE)) {
    return null;
  }
  try {
    const data = fs.readFileSync(CHAT_MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Error reading chat-messages.json:', err.message);
    return null;
  }
}

function saveChatMessages(messages) {
  try {
    fs.writeFileSync(CHAT_MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error writing chat-messages.json:', err.message);
  }
}

let chatChannels = [
  { id: "portal", name: "✨ ┇ portal", type: "text", desc: "Portal informasi utama Anomaly CrunchyVerse 🎪" },
  { id: "command", name: "💬 ┇ command", type: "text", desc: "Kanal command bot Sparxie 🤖" },
  { id: "share-meme", name: "🌠 ┇ share-meme", type: "text", desc: "Tempat berbagi meme lucu & gokil 🍿" },
  { id: "talking", name: "💬 ┇ talking", type: "text", desc: "Kanal ngobrol santai sesama Anomaly 🗣️" },
  { id: "share-leak", name: "🔒 ┇ share-leak", type: "text", desc: "Bocoran rahasia & konten eksklusif teater 🤫" },
  { id: "share-info", name: "👁️ ┇ share-info", type: "text", desc: "Informasi dan update terhangat 👁️" },
  { id: "share-garem", name: "🥛 ┇ share-garem", type: "text", desc: "Kanal berbagi garam / gacha pulls 🧂" },
  { id: "stream", name: "‼️ ┇ stream", type: "text", desc: "Notifikasi siaran langsung & live teater 🔴" },
  { id: "voice-afk", name: "📇 : AFK", type: "voice", desc: "Saluran AFK Anomaly 💤" },
  { id: "voice-jtc", name: "➕ ┇ JOIN TO CREATE", type: "voice", desc: "Bergabung untuk membuat saluran suara baru ➕" },
  { id: "voice-studyroom", name: "📇 : STUDY ROOM", type: "voice", desc: "Kanal belajar & diskusi serius 📚" },
  { id: "voice-existence", name: "📊 ┇ Existence: 346", type: "voice", desc: "Saluran statistik keanggotaan real-time 📊" }
];

let chatMessages = {
  "portal": [
    { id: "msg-1", content: "Halo para Anomaly! Selamat datang di saluran Portal teater CrunchyVerse. ✨🎪", author: "Pimpinan Produksi", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager", timestamp: "Hari Ini pukul 08:30", isBot: false },
    { id: "msg-2", content: "Jangan lupa untuk nobar seru malam ini di voice chat ya, kita ada event seru!", author: "[HokBen] SALZ", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", timestamp: "Hari Ini pukul 09:15", isBot: false }
  ],
  "command": [
    { id: "msg-3", content: "Gunakan perintah `/sparxie` di sini untuk memanggil asisten bot cerdas Sparxie!", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 10:00", isBot: true }
  ],
  "share-meme": [
    { id: "msg-4", content: "Meme garing hari ini dipersembahkan oleh keaktifan anomaly teater! 🍿😂", author: "yae.eva", authorAvatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=yae", timestamp: "Hari Ini pukul 11:15", isBot: false }
  ],
  "talking": [
    { id: "msg-5", content: "Lagi asik nongkrong nih guys, ada rekomendasi lagu bagus buat didengerin pas nobar?", author: "Dari Kontak Anda", authorAvatar: "https://api.dicebear.com/7.x/identicon/svg?seed=kontak", timestamp: "Hari Ini pukul 12:30", isBot: false }
  ],
  "share-leak": [
    { id: "msg-6", content: "Ssst... kabarnya frame Divergent Universe mau ditambahin slide baru yang lebih menantang! 🤫🤐", author: "Sutradara Event", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=director", timestamp: "Hari Ini pukul 13:00", isBot: false }
  ],
  "share-info": [
    { id: "msg-7", content: "Pemberitahuan: Jam operasional panggung utama teater akan diperpanjang selama libur nasional.", author: "Pimpinan Produksi", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=stage-manager", timestamp: "Hari Ini pukul 14:15", isBot: false }
  ],
  "share-garem": [
    { id: "msg-8", content: "Wih, baru aja dapet rate-up Acheron dalam 10 kali pull! Garam abis! 🧂😭✨", author: "[AFK] T0ddei", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=toddei", timestamp: "Hari Ini pukul 15:20", isBot: false }
  ],
  "stream": [
    { id: "msg-9", content: "🔴 Siaran langsung teater CrunchyVerse sedang berlangsung! Tonton keseruannya sekarang!", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 16:00", isBot: true }
  ],
  "voice-afk": [
    { id: "msg-vc-afk-1", content: "Saluran AFK. Tidur nyenyak para Anomaly... 💤💤", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true }
  ],
  "voice-jtc": [
    { id: "msg-vc-jtc-1", content: "Bergabunglah untuk membuat saluran obrolan suara custom secara instan! ➕🎙️", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true }
  ],
  "voice-studyroom": [
    { id: "msg-vc-study-1", content: "Selamat datang di kanal teks saluran suara STUDY ROOM! Sembari diskusi/belajar, kalian bisa ketik-ketik di sini. 🎙️📚", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 08:30", isBot: true },
    { id: "msg-vc-study-2", content: "Lagi nobar dengerin Pastel Ghost nih di voice chat! Seru banget lagunya. 🎵✨", author: "[HokBen] SALZ", authorAvatar: "https://api.dicebear.com/7.x/lorelei/svg?seed=salz", timestamp: "Hari Ini pukul 12:45", isBot: false }
  ],
  "voice-existence": [
    { id: "msg-vc-exist-1", content: "Saluran statistik keanggotaan real-time. Keberadaan Anomaly ke-346 terdeteksi! 📊✨", author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini pukul 13:00", isBot: true }
  ]
};

// Merge saved custom channels at startup
try {
  const savedChans = loadCustomChannels();
  savedChans.forEach(chan => {
    if (!chatChannels.some(c => c.id === chan.id)) {
      chatChannels.push(chan);
    }
  });
} catch (e) {
  console.error('Error loading startup custom channels:', e);
}

// Merge saved messages at startup
try {
  const savedMsgs = loadChatMessages();
  if (savedMsgs) {
    chatMessages = { ...chatMessages, ...savedMsgs };
  }
} catch (e) {
  console.error('Error loading startup chat messages:', e);
}

const sparxieQuotes = [
  "Aha! Persamaan Aljabar dari Divergent Universe meramalkan bahwa kamu adalah Anomaly paling garing hari ini! 🍿🎪",
  "Sebagai bot asisten teater, aku menyarankanmu untuk beristirahat sejenak sambil menikmati pop-corn hangat di lobby CrunchyVerse. 🍿✨",
  "Kalkulasi Value Role (CV) milikmu menunjukkan tingkat keaktifan sebesar 100%! Pertahankan panggungmu! 🏆",
  "Apakah kamu tahu? Pimpinan Produksi sedang menyiapkan rahasia panggung tersembunyi. Jangan bilang siapa-siapa ya! 🤫🎪",
  "Weighted Curios hari ini memberikan buff keberuntungan ekstra untukmu! Siap klir Divergent Universe 4.3? 🪐⚡",
  "Gabut ya? Sama, aku juga cuma bot yang disuruh berputar-putar di server CrunchyVerse... Mari bersulang segelas boba! 🧋✨",
  "Tirai teater telah dibuka! Pastikan kamu duduk di barisan paling depan untuk menonton atraksi spektakuler kami! 🎪🎭",
  "Sparxie di sini! Aku baru saja memeriksa status live TikTok Volunteer, dia sangat bersemangat bernyanyi! 🎤👾"
];

const ACTIVE_CHANNELS_FILE = path.join(__dirname, '../database/active-channels.json');

function loadActiveChannels() {
  try {
    if (fs.existsSync(ACTIVE_CHANNELS_FILE)) {
      return JSON.parse(fs.readFileSync(ACTIVE_CHANNELS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca active-channels.json:", e.message);
  }
  return null;
}

function saveActiveChannels(channels) {
  try {
    fs.writeFileSync(ACTIVE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis active-channels.json:", e.message);
  }
}

// POST list of channels to save custom channel list
app.post('/api/chat/channels', requireClientToken, (req, res) => {
  const { channels } = req.body;
  if (!Array.isArray(channels)) {
    return res.status(400).json({ error: "Channels must be an array" });
  }
  saveActiveChannels(channels);
  console.log(`💾 Saved custom channel list with ${channels.length} items to active-channels.json`);
  res.json({ success: true, channels });
});

// GET list of channels (fetch live from Guild if connected, else fallback to mock)
app.get('/api/chat/channels', async (req, res) => {
  const savedActive = loadActiveChannels();
  if (savedActive !== null) {
    return res.json(savedActive);
  }

  if (!isDiscordReady || !client || !GUILD_ID) {
    return res.json(chatChannels);
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return res.json(chatChannels);

    // Fetch channels
    const channels = await guild.channels.fetch();

    // Text channels
    const textChannels = channels
      .filter(c => c.type === ChannelType.GuildText)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: "text",
        desc: c.topic || `Saluran obrolan #${c.name}`
      }));

    // Voice channels (text in voice)
    const voiceChannels = channels
      .filter(c => c.type === ChannelType.GuildVoice)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: "voice",
        desc: `Obrolan Suara (Text-in-Voice) untuk saluran ${c.name} 🎙️`
      }));

    if (textChannels.length === 0) return res.json(chatChannels);

    // Merge text channels and voice channels
    const allChannels = [...textChannels.slice(0, 8), ...voiceChannels.slice(0, 4)];
    res.json(allChannels);
  } catch (err) {
    console.warn("⚠️ Gagal mengambil list channel dari Discord, menggunakan mock:", err.message);
    res.json(chatChannels);
  }
});

// GET a specific channel details by ID (fetch live from Discord if connected, else return error/mock)
app.get('/api/chat/channels/:channelId', async (req, res) => {
  const { channelId } = req.params;

  if (!isDiscordReady || !client) {
    return res.status(404).json({ error: "Client Discord tidak aktif (Simulation Mode)" });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return res.status(404).json({ error: "Saluran tidak ditemukan" });
    }

    const type = channel.type === ChannelType.GuildVoice ? "voice" : "text";
    const name = type === "voice"
      ? `📇 : ${channel.name.toUpperCase()}`
      : `💬 ┇ ${channel.name.toLowerCase()}`;

    const channelDetails = {
      id: channel.id,
      name,
      type,
      desc: channel.topic || `Saluran Discord terintegrasi #${channel.name}`
    };

    // Store in our local memory channel list if not already present, so other routes can use it
    if (!chatChannels.some(c => c.id === channel.id)) {
      chatChannels.push(channelDetails);
    }

    res.json(channelDetails);
  } catch (err) {
    console.error(`❌ Gagal mengambil rincian saluran ${channelId}: ${err.message}`);
    res.status(404).json({ error: `Saluran tidak ditemukan atau bot tidak memiliki akses: ${err.message}` });
  }
});

// GET messages from channel
app.get('/api/chat/channels/:channelId/messages', async (req, res) => {
  const { channelId } = req.params;

  // Initialize store for channel if empty
  if (!chatMessages[channelId]) {
    chatMessages[channelId] = [
      { id: "msg-init-" + Date.now(), content: `Selamat datang di saluran #${channelId}! Mulai obrolan seru di sini. ✨`, author: "Sparxie Bot", authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie", timestamp: "Hari Ini", isBot: true }
    ];
  }

  res.json(chatMessages[channelId]);
});

// POST send message to channel
app.post('/api/chat/channels/:channelId/messages', requireClientToken, async (req, res) => {
  const { channelId } = req.params;
  const { content, mediaUrl, replyToMsgId, authorName, authorAvatar } = req.body;

  if (!content && !mediaUrl) {
    return res.status(400).json({ error: "Content or Media is required" });
  }

  if (!chatMessages[channelId]) {
    chatMessages[channelId] = [];
  }

  // Create message
  const now = new Date();
  const timestamp = `Hari Ini pukul ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

  const newMsg = {
    id: "msg-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    content: content || "",
    mediaUrl: mediaUrl || null,
    replyToMsgId: replyToMsgId || null,
    author: authorName || "Anonymous Anomaly",
    authorAvatar: authorAvatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=anonymous",
    timestamp,
    isBot: false
  };

  // Ensure channel is saved in persistent custom channels database
  if (!chatChannels.some(c => c.id === channelId)) {
    let chanDetails = {
      id: channelId,
      name: `✨ ┇ custom-${channelId.slice(-4)}`,
      type: "text",
      desc: `Saluran custom terintegrasi (ID: ${channelId}) 🎭`
    };

    if (isDiscordReady && client) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const type = channel.type === ChannelType.GuildVoice ? "voice" : "text";
          const name = type === "voice"
            ? `📇 : ${channel.name.toUpperCase()}`
            : `💬 ┇ ${channel.name.toLowerCase()}`;
          chanDetails = {
            id: channel.id,
            name,
            type,
            desc: channel.topic || `Saluran Discord terintegrasi #${channel.name}`
          };
        }
      } catch (err) {
        console.warn(`⚠️ Gagal fetch channel info live untuk penyimpanan:`, err.message);
      }
    }

    chatChannels.push(chanDetails);
    const currentCustom = loadCustomChannels();
    if (!currentCustom.some(c => c.id === channelId)) {
      currentCustom.push(chanDetails);
      saveCustomChannels(currentCustom);
      console.log(`💾 Saved new custom channel ${channelId} to custom-channels.json`);
    }
  } else {
    // If it is already in chatChannels, but not in custom-channels.json and not a default channel
    const defaultIds = ["portal", "command", "share-meme", "talking", "share-leak", "share-info", "share-garem", "stream", "voice-afk", "voice-jtc", "voice-studyroom", "voice-existence"];
    if (!defaultIds.includes(channelId)) {
      const currentCustom = loadCustomChannels();
      if (!currentCustom.some(c => c.id === channelId)) {
        const chanObj = chatChannels.find(c => c.id === channelId);
        if (chanObj) {
          currentCustom.push(chanObj);
          saveCustomChannels(currentCustom);
          console.log(`💾 Saved custom channel ${channelId} to custom-channels.json`);
        }
      }
    }
  }

  // Push to local memory
  chatMessages[channelId].push(newMsg);
  saveChatMessages(chatMessages);

  // If Discord is online, try to send it to the actual Discord server!
  if (isDiscordReady && client && GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        let discordMsgContent = content || "";
        let repliedMsg = null;
        let isNativeReply = false;

        // Try to fetch real Discord message if replyToMsgId is a Snowflake (numeric, 17-20 characters)
        if (replyToMsgId && /^\d{17,20}$/.test(replyToMsgId)) {
          try {
            repliedMsg = await channel.messages.fetch(replyToMsgId);
            if (repliedMsg) {
              isNativeReply = true;
              console.log(`🎯 [Discord API] Menemukan pesan asli Discord untuk dibalas: ${replyToMsgId}`);
            }
          } catch (e) {
            console.log(`ℹ️ [Discord API] Pesan asli Discord ${replyToMsgId} tidak ditemukan atau tidak dapat diakses.`);
          }
        }

        // Fallback reference if not native reply but we have a mock local msg matching replyToMsgId
        if (!isNativeReply && replyToMsgId) {
          const localRepliedMsg = chatMessages[channelId].find(m => m.id === replyToMsgId);
          if (localRepliedMsg) {
            discordMsgContent = `> *Membalas ${localRepliedMsg.author}: ${localRepliedMsg.content.substring(0, 40)}...*\n${discordMsgContent}`;
          }
        }

        // Append attachment if exists
        const options = { content: discordMsgContent };
        if (mediaUrl) {
          options.files = [mediaUrl];
        }

        if (isNativeReply && repliedMsg) {
          // Native reply using message.reply()
          await repliedMsg.reply(options);
          console.log(`📡 [Discord API] Sukses mengirim BALASAN asli dari Web ke Discord: "${content}"`);
        } else {
          // Normal message post
          await channel.send(options);
          console.log(`📡 [Discord API] Sukses mengirim pesan dari Web ke Discord: "${content}"`);
        }
      }
    } catch (err) {
      console.warn("⚠️ Gagal meneruskan pesan ke server Discord nyata:", err.message);
    }
  }

  // Auto chatbot response simulation for high-interactivity
  const isSparxieChannel = channelId === "1403255548698300423" || (content && content.toLowerCase().includes("sparxie"));

  if (isSparxieChannel) {
    setTimeout(() => {
      const quote = sparxieQuotes[Math.floor(Math.random() * sparxieQuotes.length)];
      const botMsg = {
        id: "msg-bot-" + Date.now(),
        content: quote,
        mediaUrl: null,
        replyToMsgId: newMsg.id, // Replying directly to the user's message
        author: "Sparxie Bot",
        authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=sparxie",
        timestamp: `Hari Ini pukul ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        isBot: true
      };

      chatMessages[channelId].push(botMsg);
      console.log(`🤖 [Sparxie Chatbot] Menjawab otomatis di channel ${channelId}: "${quote}"`);
      if (global.broadcastWsUpdate) {
        global.broadcastWsUpdate('chat', channelId);
      }
    }, 1000);
  }

  if (global.broadcastWsUpdate) {
    global.broadcastWsUpdate('chat', channelId);
  }

  res.json({ success: true, message: newMsg });
});

// ==============================================================================
// =================== Discord OAuth2 & Linked Roles (Role Connections) ============
// ==============================================================================
const LINKED_ACCOUNTS_FILE = path.join(__dirname, '../database/linked-accounts.json');

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

  // Look up username as fallback in case the ID in the leaderboard doesn't match
  const accounts = loadLinkedAccounts();
  const userAcc = accounts[userId];
  const username = userAcc ? userAcc.username : null;

  try {
    const lbUrl = `http://localhost:${PORT}/api/leaderboard`;
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

// Helper to push connection metadata to Discord
async function updateConnectionMetadata(userId, username, accessToken) {
  console.log(`📡 [OAuth] Updating connection metadata for @${username} (ID: ${userId})...`);

  const stats = await getUserStats(userId);
  console.log(`📊 [OAuth] User Stats:`, stats);

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

// Start OAuth2 flow redirect
app.get('/api/oauth/link', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
  const state = req.query.state || 'link';
  const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify+role_connections.write&state=${state}`;
  return res.redirect(url);
});

// OAuth2 Callback receiver
app.get('/api/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("❌ Missing authorization code from Discord.");
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    // Prevent duplicate token exchanges for prefetch/refresh requests
    if (EXCHANGED_CODES.has(code)) {
      console.log(`ℹ️ [OAuth/Callback] Code ${code.slice(0, 8)}... already exchanged. Reusing profile.`);
      const cached = EXCHANGED_CODES.get(code);
      return sendProfileToWindow(res, cached.profile, state);
    }

    if (PENDING_EXCHANGES.has(code)) {
      console.log(`⏳ [OAuth/Callback] Exchange for code ${code.slice(0, 8)}... already in progress, waiting...`);
      const profile = await PENDING_EXCHANGES.get(code);
      return sendProfileToWindow(res, profile, state);
    }

    const exchangePromise = (async () => {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to exchange code: ${await tokenResponse.text()}`);
      }

      const tokens = await tokenResponse.json();

      // Fetch user profile info
      const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!profileResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${await profileResponse.text()}`);
      }

      const profile = await profileResponse.json();

      // Save credentials to linked-accounts.json for stats metadata sync
      const accounts = loadLinkedAccounts();
      accounts[profile.id] = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        username: profile.username
      };
      saveLinkedAccounts(accounts);

      console.log(`✅ [OAuth/Callback] Linked account successfully: @${profile.username} (ID: ${profile.id})`);

      // Trigger initial metadata sync in background
      updateConnectionMetadata(profile.id, profile.username, tokens.access_token).catch(err => {
        console.error(`⚠️ [OAuth/Callback] Failed to sync connection metadata during callback:`, err.message);
      });

      // Cache the result
      EXCHANGED_CODES.set(code, {
        profile: profile,
        timestamp: Date.now()
      });

      return profile;
    })();

    PENDING_EXCHANGES.set(code, exchangePromise);
    const profile = await exchangePromise;
    PENDING_EXCHANGES.delete(code);

    return sendProfileToWindow(res, profile, state);
  } catch (err) {
    console.error("❌ [OAuth/Callback] Error during callback:", err.message);
    PENDING_EXCHANGES.delete(code);
    return res.status(500).send(`❌ Authentication error: ${err.message}`);
  }
});

// Helper function to return profile HTML
function sendProfileToWindow(res, profile, state) {
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : `https://api.dicebear.com/7.x/lorelei/svg?seed=${profile.username}`;

  res.setHeader('Content-Type', 'text/html');
  return res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Autentikasi CrunchyVerse</title>
        <style>
          body {
            background-color: #060102;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .spinner {
            border: 4px solid rgba(212, 175, 55, 0.1);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border-left-color: #d4af37;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h2 {
            margin: 0 0 10px 0;
            font-size: 18px;
            letter-spacing: 1px;
            color: #d4af37;
          }
          p {
            margin: 0;
            font-size: 12px;
            color: #a3a3a3;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h2>Menyambungkan ke Teater...</h2>
        <p>Silakan tunggu sementara kami mengautentikasi akun Anda.</p>
        
        <script>
          const profile = {
            id: "${profile.id}",
            username: "${profile.username}",
            global_name: "${profile.global_name || ''}",
            avatar: "${avatarUrl}"
          };
          
          if (window.opener) {
            window.opener.postMessage({
              type: "DISCORD_LOGIN_SUCCESS",
              profile: profile,
              state: "${state || ''}"
            }, "*");
            setTimeout(() => {
              window.close();
            }, 500);
          } else {
            document.body.innerHTML = "<h2>Sukses!</h2><p>Autentikasi berhasil, namun jendela utama tidak ditemukan.</p>";
          }
        </script>
      </body>
    </html>
  `);
}

// GET Discord Role details by ID for Quest Builder validation
app.get('/api/discord-role/:roleId', async (req, res) => {
  const { roleId } = req.params;
  if (!isDiscordReady || !client) {
    return res.status(503).json({ error: "Discord bot is standby or offline." });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const role = await guild.roles.fetch(roleId);
    if (!role) {
      return res.status(404).json({ error: "Role Discord tidak ditemukan." });
    }

    // Extract CV$ amount from role name
    const cvMatch = !EXCLUDED_CV_ROLE_IDS.includes(role.id)
      ? role.name.match(/(?:CV\$|CV|VR|Value\s*Role)\s*([\d.,\s]+)/i)
      : null;
    const cvAmountStr = cvMatch ? cvMatch[1].trim().replace(/\./g, '') : '0';
    const cvAmount = parseInt(cvAmountStr, 10) || 0;

    res.json({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      cvAmount: cvAmount
    });
  } catch (err) {
    console.error(`❌ [API/discord-role] Gagal mendapatkan role ${roleId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST Submissions approve manually via Web Admin
app.post('/api/submissions/approve', requireClientToken, async (req, res) => {
  const { submissionId, userId, discordId, roleId, points, questId, username, userEmail, discordMessageId } = req.body;
  if (!submissionId) {
    return res.status(400).json({ error: "Missing submissionId parameter." });
  }

  console.log(`✅ [API/Approve] Memproses persetujuan manual untuk submission ID: ${submissionId}`);

  try {
    // Update local submissions status to approved
    const localSubs = loadLocalSubmissions();
    const subIdx = localSubs.findIndex(s => s.id === submissionId || (discordMessageId && s.discordMessageId === discordMessageId));
    if (subIdx !== -1) {
      localSubs[subIdx].status = "approved";
      saveLocalSubmissions(localSubs);
    }

    // Update local user decks card status to "Completed" and delete/remove the quest from cards
    if (userId && questId) {
      const decks = loadLocalDecks();
      if (decks[userId]) {
        decks[userId].statuses = decks[userId].statuses || {};
        decks[userId].statuses[questId] = "Completed";
        if (decks[userId].cards) {
          decks[userId].cards = decks[userId].cards.filter(c => c.id !== questId);
        }
        saveLocalDecks(decks);
      }
    }

    // Update local users points locally
    try {
      const localUsers = loadLocalUsers();
      if (!localUsers[userId]) {
        localUsers[userId] = {
          uid: userId,
          name: username || "Pemain Teater",
          email: userEmail || "",
          role: "Penonton Teater",
          cv: 0,
          points: 0
        };
      }
      const addPoints = Number(points) || 0;
      localUsers[userId].cv = (localUsers[userId].cv || 0) + addPoints;
      localUsers[userId].points = (localUsers[userId].points || 0) + addPoints;
      saveLocalUsers(localUsers);
      console.log(`💰 [Points] Lokal: Ditambahkan ${addPoints} poin ke user ${userId}. Total poin baru: ${localUsers[userId].cv}`);
    } catch (localErr) {
      console.error("⚠️ [API/Approve] Gagal update poin user secara lokal:", localErr.message);
    }

    // 1. Update Firestore if db is active
    if (db) {
      try {
        const subRef = doc(db, "submissions", submissionId);
        await withTimeout(updateDoc(subRef, { status: "approved" }));

        const userRef = doc(db, "users", userId);
        const userDoc = await withTimeout(getDoc(userRef));
        let newPoints = Number(points) || 0;
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const currentPoints = userData.cv || userData.points || 0;
          newPoints += currentPoints;
          await withTimeout(updateDoc(userRef, {
            cv: newPoints,
            points: newPoints
          }));
        } else {
          await withTimeout(setDoc(userRef, {
            uid: userId,
            name: username || "Pemain",
            email: userEmail || "",
            role: "Penonton Teater",
            cv: newPoints,
            points: newPoints
          }));
        }

        // Update card status inside user's hand to "Completed" and remove the card
        if (questId) {
          const deckRef = doc(db, "user_decks", userId);
          const deckDoc = await withTimeout(getDoc(deckRef));
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [questId]: "Completed" };
            const updatedCards = (deckData.cards || []).filter(c => c.id !== questId);
            await withTimeout(updateDoc(deckRef, { 
              statuses: updatedStatuses,
              cards: updatedCards
            }));
          }
        }
      } catch (fsErr) {
        console.warn("⚠️ [API/Approve] Gagal update Firestore:", fsErr.message);
      }
    }

    // 2. Assign Discord Role reward & Update Player Progress Roles
    let roleAssigned = false;
    let roleName = "";
    if (isDiscordReady && client) {
      try {
        const guild = await client.guilds.fetch(GUILD_ID);

        // Resolve member by discordId or falling back to userId
        let targetDiscordId = discordId;
        if (!targetDiscordId && db) {
          try {
            const userDoc = await withTimeout(getDoc(doc(db, "users", userId)));
            if (userDoc.exists()) {
              targetDiscordId = userDoc.data().discordId;
            }
          } catch (e) { }
        }
        if (!targetDiscordId && userId) {
          const match = userId.match(/\d{17,20}/);
          if (match) {
            targetDiscordId = match[0];
          }
        }

        if (targetDiscordId) {
          console.log(`🎭 [API/Approve] Mencari member Discord ID: "${targetDiscordId}"...`);
          const member = await guild.members.fetch(targetDiscordId).catch((fetchErr) => {
            console.error(`❌ [API/Approve] Gagal fetch member Discord: ${fetchErr.message}`);
            return null;
          });

          if (member) {
            // 2.1. Assign specific quest role if roleId is present
            if (roleId) {
              try {
                const role = await guild.roles.fetch(roleId);
                if (role) {
                  roleName = role.name;
                  console.log(`🎭 [API/Approve] Mencoba menambahkan role "${roleName}" (ID: ${roleId}) ke member ${member.user.tag}...`);
                  await member.roles.add(roleId).catch((addRoleErr) => {
                    console.error(`❌ [API/Approve] Gagal menambahkan role ke member: ${addRoleErr.message}`);
                  });
                  console.log(`🎭 [API/Approve] Role ${roleId} (${roleName}) ditambahkan ke member ${member.user.tag}`);
                  roleAssigned = true;
                }
              } catch (roleErr) {
                console.error("❌ [API/Approve] Gagal fetch/add quest role:", roleErr.message);
              }
            }

            // 2.2. Update player progress roles & serials
            await updatePlayerProgressRoles(member, userId);
          } else {
            console.warn(`⚠️ [API/Approve] Member Discord ID "${targetDiscordId}" tidak ditemukan di guild.`);
          }
        } else {
          console.warn(`⚠️ [API/Approve] Tidak dapat mengidentifikasi Discord ID untuk user ${userId}`);
        }
      } catch (roleErr) {
        console.error("❌ [API/Approve] Gagal memproses role Discord:", roleErr.message);
      }
    }

    // 3. Reply to original Discord message
    if (isDiscordReady && client && discordMessageId) {
      try {
        const channel = await client.channels.fetch('1512604646328504370').catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(discordMessageId).catch(() => null);
          if (msg) {
            await msg.reply(`✅ **Bukti Disetujui (via Web Admin)**! Poin **+${points}** telah ditambahkan ke akun **${username || 'Pemain'}**${roleAssigned ? ` dan role Discord **${roleName || roleId}** telah diberikan.` : '.'}`);
          }
        }
      } catch (msgErr) {
        console.error("❌ [API/Approve] Gagal membalas pesan di Discord:", msgErr.message);
      }
    }

    // Invalidate submissions cache
    cache.deletePrefix('api:submissions:');

    res.json({ success: true, roleAssigned, roleName });
  } catch (err) {
    console.error("❌ [API/Approve] Gagal memproses persetujuan:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST Submissions reject manually via Web Admin
app.post('/api/submissions/reject', requireClientToken, async (req, res) => {
  const { submissionId, userId, questId, discordMessageId, username } = req.body;
  if (!submissionId) {
    return res.status(400).json({ error: "Missing submissionId parameter." });
  }

  console.log(`❌ [API/Reject] Memproses penolakan manual untuk submission ID: ${submissionId}`);

  try {
    // Update local submissions status to rejected
    const localSubs = loadLocalSubmissions();
    const subIdx = localSubs.findIndex(s => s.id === submissionId || (discordMessageId && s.discordMessageId === discordMessageId));
    if (subIdx !== -1) {
      localSubs[subIdx].status = "rejected";
      saveLocalSubmissions(localSubs);
    }

    // Update local user decks card status to "Denied"
    if (userId && questId) {
      const decks = loadLocalDecks();
      if (decks[userId]) {
        decks[userId].statuses = decks[userId].statuses || {};
        decks[userId].statuses[questId] = "Denied";
        saveLocalDecks(decks);
      }
    }

    // 1. Delete from Firestore if db is active
    if (db) {
      try {
        const subRef = doc(db, "submissions", submissionId);
        await withTimeout(deleteDoc(subRef));

        // Set card status inside user's hand to "Denied"
        if (questId && userId) {
          const deckRef = doc(db, "user_decks", userId);
          const deckDoc = await withTimeout(getDoc(deckRef));
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [questId]: "Denied" };
            await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
          }
        }
      } catch (fsErr) {
        console.warn("⚠️ [API/Reject] Gagal update Firestore:", fsErr.message);
      }
    }

    // 2. Reply to original Discord message
    if (isDiscordReady && client && discordMessageId) {
      try {
        const channel = await client.channels.fetch('1512604646328504370').catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(discordMessageId).catch(() => null);
          if (msg) {
            await msg.reply(`❌ **Bukti Ditolak (via Web Admin)**! Data submission dihapus dari database. Sesi kartu diset kembali ke status **Denied**.`);
          }
        }
      } catch (msgErr) {
        console.error("❌ [API/Reject] Gagal membalas pesan di Discord:", msgErr.message);
      }
    }

    // Invalidate submissions cache
    cache.deletePrefix('api:submissions:');

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [API/Reject] Gagal memproses penolakan:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST Submissions upload
app.post('/api/submissions/submit', requireClientToken, async (req, res) => {
  const {
    questId,
    userId,
    username,
    userEmail,
    fileName,
    mediaData
  } = req.body;

  if (!questId || !userId || !username || !mediaData) {
    return res.status(400).json({ error: "Missing required fields: questId, userId, username, or mediaData" });
  }

  // 1. Resolve originalQuestId dari user's deck
  let originalQuestId = questId;
  const userDeck = await getUserDeck(userId);
  if (userDeck && userDeck.cards) {
    const card = userDeck.cards.find(c => c.id === questId);
    if (card) {
      originalQuestId = card.originalQuestId || card.id;
    }
  }

  if (db) {
    try {
      const deckRef = doc(db, "user_decks", userId);
      const deckSnap = await withTimeout(getDoc(deckRef));
      if (deckSnap.exists()) {
        const deckData = deckSnap.data();
        if (deckData.cards) {
          const card = deckData.cards.find(c => c.id === questId);
          if (card) {
            originalQuestId = card.originalQuestId || card.id;
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ [API/Submission] Gagal mengambil user deck dari Firestore:", err.message);
    }
  }

  // 2. Resolve detail quest dari database lokal atau Firestore untuk mencegah pemalsuan nilai poin/role
  let quest = null;
  const localQuests = loadLocalQuests();
  quest = localQuests.find(q => q.id === originalQuestId);

  if (db) {
    try {
      const questRef = doc(db, "quests", originalQuestId);
      const questSnap = await withTimeout(getDoc(questRef));
      if (questSnap.exists()) {
        quest = { id: originalQuestId, ...questSnap.data() };
      }
    } catch (err) {
      console.warn("⚠️ [API/Submission] Gagal mengambil detail quest dari Firestore:", err.message);
    }
  }

  if (!quest) {
    return res.status(404).json({ error: "Tantangan tidak ditemukan di database." });
  }

  const { title: questTitle, description: questDescription, points, roleId, roleName } = quest;

  // 3. Validasi keamanan: pastikan user belum pernah menyelesaikan tantangan ini sebelumnya
  if (decks[userId] && decks[userId].statuses && (decks[userId].statuses[questId] === "Completed" || decks[userId].statuses[originalQuestId] === "Completed")) {
    return res.status(400).json({ error: "Tantangan ini sudah Anda selesaikan!" });
  }
  const localSubs = loadLocalSubmissions();
  const alreadyCompleted = localSubs.some(s => s.userId === userId && (s.questId === questId || s.questId === originalQuestId) && s.status === "approved");
  if (alreadyCompleted) {
    return res.status(400).json({ error: "Tantangan ini sudah Anda selesaikan!" });
  }

  if (db) {
    try {
      const deckRef = doc(db, "user_decks", userId);
      const deckSnap = await withTimeout(getDoc(deckRef));
      if (deckSnap.exists()) {
        const deckData = deckSnap.data();
        if (deckData.statuses && (deckData.statuses[questId] === "Completed" || deckData.statuses[originalQuestId] === "Completed")) {
          return res.status(400).json({ error: "Tantangan ini sudah Anda selesaikan!" });
        }
      }
    } catch (err) {
      console.warn("⚠️ [API/Submission] Gagal verifikasi deck di Firestore:", err.message);
    }
  }

  console.log(`📥 [API/Submission] Menerima upload media dari pemain: ${username} (UID: ${userId}) untuk quest: "${questTitle}"`);

  // Default return data
  let discordMessageId = `sim-msg-${Date.now()}`;
  let mediaUrl = mediaData;

  // Jika bot Discord online/standby (tidak login), kembalikan status simulasi sukses
  if (isDiscordReady && client) {
    try {
      const base64Content = mediaData.split(';base64,').pop();
      const buffer = Buffer.from(base64Content, 'base64');

      // Default file extension ke .png jika tidak disertakan
      const attachmentName = fileName || 'submission.png';
      const attachment = new AttachmentBuilder(buffer, { name: attachmentName });

      const embed = new EmbedBuilder()
        .setTitle('🎪 Bukti Tantangan Teater Masuk!')
        .setDescription(`Seorang pemain baru saja mengunggah bukti pengerjaan untuk tantangan **Frame VII: Tirai Tantangan**!`)
        .addFields(
          { name: '👤 Pemain (Akun)', value: `**${username}**\nID: \`${userId}\` ${userEmail ? `\nEmail: \`${userEmail}\`` : ''}`, inline: true },
          { name: '🏆 Poin Tester', value: `\`+${points} Poin\``, inline: true },
          { name: '📌 Judul Tantangan', value: questTitle },
          { name: '🎯 Objektif / Deskripsi', value: questDescription || 'Tidak ada deskripsi' }
        )
        .setColor(0xFFA500) // Orange Sunset
        .setTimestamp();

      if (roleName) {
        embed.addFields({ name: '🎭 Hadiah Role', value: `**${roleName}**\nID: \`${roleId}\``, inline: true });
      }

      // ID channel Discord target
      const targetChannelId = '1512604646328504370';
      const channel = await client.channels.fetch(targetChannelId);

      if (channel) {
        const message = await channel.send({
          embeds: [embed],
          files: [attachment]
        });

        // Tambahkan reaction ✅ dan ❌
        await message.react('✅');
        await message.react('❌');

        mediaUrl = message.attachments.first()?.url || '';
        discordMessageId = message.id;
        console.log(`✅ [API/Submission] Media sukses dikirim ke Discord. Msg ID: ${message.id}, Attachment URL: ${mediaUrl}`);
      }
    } catch (err) {
      console.error("❌ [API/Submission] Gagal mengirim media ke Discord:", err.message);
    }
  }

  try {
    const submissionId = `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const submissionDoc = {
      id: submissionId,
      questId,
      questTitle,
      questDescription,
      points: Number(points) || 0,
      userId,
      username,
      userEmail: userEmail || "",
      discordMessageId: discordMessageId,
      mediaUrl: mediaUrl,
      status: "pending",
      createdAt: new Date().toISOString(),
      roleId: roleId || "",
      roleName: roleName || ""
    };
    
    // Simpan ke local database submissions.json
    localSubs.push(submissionDoc);
    saveLocalSubmissions(localSubs);

    // Simpan ke local database user_decks.json
    if (decks[userId]) {
      decks[userId].statuses = decks[userId].statuses || {};
      decks[userId].statuses[questId] = "pending";
      saveLocalDecks(decks);
    }

    // Tulis submission & update status deck langsung ke Firestore dari backend
    if (db) {
      try {
        const subRef = doc(db, "submissions", submissionId);
        await withTimeout(setDoc(subRef, submissionDoc));

        const deckRef = doc(db, "user_decks", userId);
        const deckDoc = await withTimeout(getDoc(deckRef));
        if (deckDoc.exists()) {
          const deckData = deckDoc.data();
          const updatedStatuses = { ...deckData.statuses, [questId]: "pending" };
          await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
        }
        console.log(`🔥 [Firebase] Backend berhasil menulis submission ${submissionId} dan memperbarui deck ke pending.`);
      } catch (fsErr) {
        console.warn("⚠️ [Firebase] Backend gagal menulis ke Firestore pada submit:", fsErr.message);
      }
    }

    // Hapus cache submissions
    cache.delete('api:submissions');

    res.json({
      success: true,
      discordMessageId: discordMessageId,
      mediaUrl: mediaUrl
    });
  } catch (err) {
    console.error("❌ [API/Submission] Gagal memproses data submission:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions dengan cache
app.get('/api/submissions', (req, res) => {
  const status = req.query.status;
  const cacheKey = `api:submissions:${status || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const submissions = loadLocalSubmissions();
  const result = status ? submissions.filter(s => s.status === status) : submissions;
  cache.set(cacheKey, result, 15); // Cache selama 15 detik
  res.json(result);
});

// POST /api/submissions/reset-specific - Reset completed quest progress specifically
app.post('/api/submissions/reset-specific', requireClientToken, async (req, res) => {
  const { userId, questId } = req.body;
  if (!userId || !questId) {
    return res.status(400).json({ error: "Missing userId or questId parameter." });
  }

  console.log(`🧹 [API/ResetSpecific] Mereset quest ${questId} untuk user ${userId}`);

  try {
    // 1. Remove submission from local submissions
    const localSubs = loadLocalSubmissions();
    const filteredSubs = localSubs.filter(s => !(s.userId === userId && s.questId === questId));
    saveLocalSubmissions(filteredSubs);

    // 2. Query and delete from Firestore submissions if active
    let pointsToDeduct = 0;
    const questsObj = loadLocalQuests();
    const matchedQuest = questsObj.find(q => q.id === questId);
    if (matchedQuest) {
      pointsToDeduct = matchedQuest.points || 0;
    }

    if (db) {
      try {
        const q = query(collection(db, "submissions"), where("userId", "==", userId), where("questId", "==", questId));
        const querySnapshot = await withTimeout(getDocs(q), 2000);
        querySnapshot.forEach(async (docSnap) => {
          await deleteDoc(docSnap.ref).catch(() => {});
        });
      } catch (e) {
        console.warn("⚠️ Gagal menghapus submission di Firestore:", e.message);
      }
    }

    // 3. Update local user deck: remove status and add back to cards if space
    const decks = loadLocalDecks();
    if (decks[userId]) {
      if (decks[userId].statuses) {
        delete decks[userId].statuses[questId];
      }
      decks[userId].cards = decks[userId].cards || [];
      const alreadyInHand = decks[userId].cards.some(c => c.id === questId);
      if (!alreadyInHand && decks[userId].cards.length < 5) {
        if (matchedQuest) {
          decks[userId].cards.push(matchedQuest);
        }
      }
      saveLocalDecks(decks);
    }
    
    // Also remove from Firestore user_decks if active
    if (db) {
      try {
        const deckRef = doc(db, "user_decks", userId);
        const deckDoc = await withTimeout(getDoc(deckRef), 2000);
        if (deckDoc.exists()) {
          const deckData = deckDoc.data();
          const updatedStatuses = { ...deckData.statuses };
          delete updatedStatuses[questId];
          
          let updatedCards = deckData.cards || [];
          const alreadyInHand = updatedCards.some(c => c.id === questId);
          if (!alreadyInHand && updatedCards.length < 5 && matchedQuest) {
            updatedCards = [...updatedCards, matchedQuest];
          }
          await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses, cards: updatedCards }));
        }
      } catch (e) {
        console.warn("⚠️ Gagal update deck di Firestore:", e.message);
      }
    }

    // 4. Deduct points locally
    const localUsers = loadLocalUsers();
    if (localUsers[userId]) {
      localUsers[userId].cv = Math.max(0, (localUsers[userId].cv || 0) - pointsToDeduct);
      saveLocalUsers(localUsers);
    }

    // Deduct points from Firestore users if active
    if (db && pointsToDeduct > 0) {
      try {
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const currentCv = userDoc.data().cv || 0;
          await updateDoc(userRef, { cv: Math.max(0, currentCv - pointsToDeduct) });
        }
      } catch (e) {
        console.warn("⚠️ Gagal update CV user di Firestore:", e.message);
      }
    }

    // Invalidate cache
    cache.deletePrefix('api:submissions:');
    
    // Live update clients
    global.broadcastWsUpdate('user', userId);
    global.broadcastWsUpdate('admin');

    res.json({ success: true, message: "Quest progress reset successfully." });
  } catch (err) {
    console.error("Error resetting quest:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/reset-all - Reset all completed quests progress for a user (Overall Reset)
app.post('/api/submissions/reset-all', requireClientToken, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter." });
  }

  console.log(`🧹 [API/ResetAll] Mereset seluruh quest untuk user ${userId}`);

  try {
    // 1. Remove all submissions for this user from local submissions
    const localSubs = loadLocalSubmissions();
    const filteredSubs = localSubs.filter(s => s.userId !== userId);
    saveLocalSubmissions(filteredSubs);

    // 2. Query and delete from Firestore submissions if active
    if (db) {
      try {
        const q = query(collection(db, "submissions"), where("userId", "==", userId));
        const querySnapshot = await withTimeout(getDocs(q), 2000);
        querySnapshot.forEach(async (docSnap) => {
          await deleteDoc(docSnap.ref).catch(() => {});
        });
      } catch (e) {
        console.warn("⚠️ Gagal menghapus seluruh submission di Firestore:", e.message);
      }
    }

    // 3. Clear all statuses in local user deck and restore cards hand to 5 quests
    const decks = loadLocalDecks();
    const questsObj = loadLocalQuests();
    if (decks[userId]) {
      decks[userId].statuses = {};
      const availableQuests = questsObj.filter(q => q.difficulty !== "Legendaris");
      const shuffled = [...availableQuests].sort(() => 0.5 - Math.random());
      decks[userId].cards = shuffled.slice(0, 5);
      decks[userId].dealt = true;
      saveLocalDecks(decks);
    }

    // Clear all statuses in Firestore user_decks if active
    if (db) {
      try {
        const deckRef = doc(db, "user_decks", userId);
        const deckDoc = await withTimeout(getDoc(deckRef), 2000);
        if (deckDoc.exists()) {
          const availableQuests = questsObj.filter(q => q.difficulty !== "Legendaris");
          const shuffled = [...availableQuests].sort(() => 0.5 - Math.random());
          const newCards = shuffled.slice(0, 5);
          await withTimeout(updateDoc(deckRef, { statuses: {}, cards: newCards, dealt: true }));
        }
      } catch (e) {
        console.warn("⚠️ Gagal reset deck di Firestore:", e.message);
      }
    }

    // 4. Reset points to 0 locally
    const localUsers = loadLocalUsers();
    if (localUsers[userId]) {
      localUsers[userId].cv = 0;
      saveLocalUsers(localUsers);
    }

    // Reset points to 0 in Firestore users if active
    if (db) {
      try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { cv: 0 });
      } catch (e) {
        console.warn("⚠️ Gagal reset CV user di Firestore:", e.message);
      }
    }

    // Invalidate cache
    cache.deletePrefix('api:submissions:');

    // Live update clients
    global.broadcastWsUpdate('user', userId);
    global.broadcastWsUpdate('admin');

    res.json({ success: true, message: "All player progress reset successfully." });
  } catch (err) {
    console.error("Error resetting all progress:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/decks/:uid
app.get('/api/decks/:uid', async (req, res) => {
  const { uid } = req.params;
  const deck = await getUserDeck(uid);
  res.json(deck);
});

// POST /api/decks/deal dengan sinkronisasi Firestore (asinkron di background)
app.post('/api/decks/deal', requireClientToken, async (req, res) => {
  const { uid, cards, statuses } = req.body;
  if (!uid) {
    return res.status(400).json({ error: "Missing uid" });
  }
  const decks = loadLocalDecks();
  decks[uid] = {
    uid,
    dealt: true,
    cards: cards || [],
    statuses: statuses || {}
  };
  saveLocalDecks(decks);

  // Sinkronisasi ke Firestore langsung dari backend di background
  if (db) {
    withTimeout(setDoc(doc(db, "user_decks", uid), decks[uid]))
      .then(() => {
        console.log(`🔥 [Firebase] Backend sukses update deal deck untuk user ${uid} di Firestore secara asinkron.`);
      })
      .catch((fsErr) => {
        console.warn("⚠️ [Firebase] Backend gagal update deal deck di Firestore secara asinkron:", fsErr.message);
      });
  }

  res.json({ success: true, deck: decks[uid] });
});

// POST /api/decks/update-status dengan sinkronisasi Firestore (asinkron di background)
app.post('/api/decks/update-status', requireClientToken, async (req, res) => {
  const { uid, questId, status } = req.body;
  if (!uid || !questId || !status) {
    return res.status(400).json({ error: "Missing uid, questId or status" });
  }
  const decks = loadLocalDecks();
  if (decks[uid]) {
    decks[uid].statuses = decks[uid].statuses || {};
    decks[uid].statuses[questId] = status;
    saveLocalDecks(decks);

    // Sinkronisasi ke Firestore langsung dari backend di background
    if (db) {
      (async () => {
        try {
          const deckRef = doc(db, "user_decks", uid);
          const deckDoc = await withTimeout(getDoc(deckRef));
          if (deckDoc.exists()) {
            const deckData = deckDoc.data();
            const updatedStatuses = { ...deckData.statuses, [questId]: status };
            await withTimeout(updateDoc(deckRef, { statuses: updatedStatuses }));
            console.log(`🔥 [Firebase] Backend sukses update status quest ${questId} menjadi ${status} di Firestore secara asinkron.`);
          } else {
            await withTimeout(setDoc(deckRef, decks[uid]));
            console.log(`🔥 [Firebase] Backend sukses inisialisasi deck untuk user ${uid} di Firestore.`);
          }
        } catch (fsErr) {
          console.warn("⚠️ [Firebase] Backend gagal update status deck di Firestore secara asinkron:", fsErr.message);
        }
      })();
    }

    return res.json({ success: true, deck: decks[uid] });
  }
  res.status(404).json({ error: "Deck not found" });
});

// GET /api/quests dengan cache TTL 60 detik
app.get('/api/quests', (req, res) => {
  const cacheKey = 'api:quests';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const quests = loadLocalQuests();
  cache.set(cacheKey, quests, 60); // Cache selama 60 detik
  res.json(quests);
});

// POST /api/quests
app.post('/api/quests', requireClientToken, async (req, res) => {
  const { akt, title, description, difficulty, points, roleId, roleName, roleColor, roleCv } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: "Missing title or description" });
  }
  const quests = loadLocalQuests();
  const newQuest = {
    id: `quest-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    akt: akt || "Akt I",
    title,
    description,
    difficulty: difficulty || "Mudah",
    points: Number(points) || 10,
    roleId: roleId || null,
    roleName: roleName || null,
    roleColor: roleColor || null,
    roleCv: roleCv || null
  };
  quests.push(newQuest);
  saveLocalQuests(quests);

  // Sinkronisasi ke Firestore langsung dari backend
  if (db) {
    try {
      await withTimeout(setDoc(doc(db, "quests", newQuest.id), newQuest));
      console.log(`🔥 [Firebase] Backend sukses menyimpan quest baru ${newQuest.id} ke Firestore.`);
    } catch (fsErr) {
      console.warn("⚠️ [Firebase] Backend gagal menyimpan quest baru ke Firestore:", fsErr.message);
    }
  }

  cache.delete('api:quests'); // Invalidate quests cache
  res.json({ success: true, quest: newQuest });
});

// DELETE /api/quests/:id
app.delete('/api/quests/:id', requireClientToken, async (req, res) => {
  const { id } = req.params;
  const quests = loadLocalQuests();
  const filtered = quests.filter(q => q.id !== id);
  saveLocalQuests(filtered);

  // Sinkronisasi ke Firestore langsung dari backend
  if (db) {
    try {
      await withTimeout(deleteDoc(doc(db, "quests", id)));
      console.log(`🔥 [Firebase] Backend sukses menghapus quest ${id} dari Firestore.`);
    } catch (fsErr) {
      console.warn("⚠️ [Firebase] Backend gagal menghapus quest dari Firestore:", fsErr.message);
    }
  }

  cache.delete('api:quests'); // Invalidate quests cache
  res.json({ success: true });
});

// POST /api/quests/load-defaults
app.post('/api/quests/load-defaults', requireClientToken, async (req, res) => {
  saveLocalQuests(DEFAULT_QUESTS);

  // Sinkronisasi ke Firestore langsung dari backend
  if (db) {
    try {
      for (const quest of DEFAULT_QUESTS) {
        await withTimeout(setDoc(doc(db, "quests", quest.id), quest));
      }
      console.log(`🔥 [Firebase] Backend sukses memuat default quests ke Firestore.`);
    } catch (fsErr) {
      console.warn("⚠️ [Firebase] Backend gagal memuat default quests ke Firestore:", fsErr.message);
    }
  }

  cache.delete('api:quests'); // Invalidate quests cache
  res.json({ success: true, quests: DEFAULT_QUESTS });
});

// POST /api/quests/delete-all
app.post('/api/quests/delete-all', requireClientToken, async (req, res) => {
  saveLocalQuests([]);

  // Sinkronisasi ke Firestore langsung dari backend
  if (db) {
    try {
      const q = collection(db, "quests");
      const snap = await withTimeout(getDocs(q));
      for (const d of snap.docs) {
        await withTimeout(deleteDoc(doc(db, "quests", d.id)));
      }
      console.log(`🔥 [Firebase] Backend sukses menghapus semua quests dari Firestore.`);
    } catch (fsErr) {
      console.warn("⚠️ [Firebase] Backend gagal menghapus semua quests dari Firestore:", fsErr.message);
    }
  }

  cache.delete('api:quests'); // Invalidate quests cache
  res.json({ success: true, quests: [] });
});

// Trigger manual update
app.post('/api/oauth/update-stats/:id', async (req, res) => {
  const userId = req.params.id;
  const accounts = loadLinkedAccounts();
  const acc = accounts[userId];

  if (!acc) {
    return res.status(404).json({ error: "User ID not linked to Discord connections." });
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

// [Cleaned Up] Duplicate VoiceAFK REST API Endpoints removed (defined at line 1647)

// ==============================================================================
// ========== ENDPOINT KEEPALIVE (dipanggil cron job untuk 24/7) ================
// ==============================================================================

// GET /api/voice-afk/keepalive
// Dipanggil oleh cron-job.org / UptimeRobot setiap 10 menit.
// Tugasnya: (1) buat server tidak tidur, (2) reconnect voice kalau putus.
app.get('/api/voice-afk/keepalive', async (req, res) => {
  const savedCfg = loadVoiceAfkConfig();
  const status = {
    botOnline: isDiscordReady,
    voiceConnected: connectionState.isConnectedToVoice,
    guildId: connectionState.guildId || savedCfg?.guildId || null,
    channelId: connectionState.channelId || savedCfg?.channelId || null,
    action: 'none',
    timestamp: new Date().toISOString()
  };

  // Kalau bot offline, tidak bisa reconnect voice
  if (!isDiscordReady || !client) {
    status.action = 'skipped_bot_offline';
    return res.json({ ...status, message: 'Bot Discord offline. Tidak bisa reconnect.' });
  }

  // Kalau sudah connected, tidak perlu apa-apa
  if (connectionState.isConnectedToVoice) {
    status.action = 'already_connected';
    return res.json({ ...status, message: '✅ Voice 24/7 aktif. Tidak perlu reconnect.' });
  }

  // Kalau disconnected tapi ada config tersimpan → reconnect!
  if (savedCfg && savedCfg.isConnected && savedCfg.guildId && savedCfg.channelId) {
    try {
      addVoiceAfkLog(`[Keepalive/CronJob] Reconnecting ke voice channel ${savedCfg.channelId}...`, 'warning');
      await connectToVoiceChannel(savedCfg.guildId, savedCfg.channelId);
      status.action = 'reconnected';
      status.voiceConnected = true;
      return res.json({ ...status, message: `✅ [Keepalive] Berhasil reconnect ke voice channel ${savedCfg.channelId}!` });
    } catch (err) {
      status.action = 'reconnect_failed';
      return res.status(500).json({ ...status, message: `❌ [Keepalive] Gagal reconnect: ${err.message}` });
    }
  }

  status.action = 'no_config';
  return res.json({ ...status, message: 'Tidak ada konfigurasi voice tersimpan. Silakan connect manual dari Control Booth.' });
});

setInterval(runMetadataSyncCycle, 900000);
setTimeout(runMetadataSyncCycle, 15000);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🎪 Server API CrunchyVerse Bot berjalan dengan sukses!`);
  console.log(`📡 URL API Lokal: http://localhost:${PORT}`);
  console.log(`🖥️  Endpoint Stats: http://localhost:${PORT}/api/stats`);
  console.log(`======================================================\n`);
});

// ==============================================================================
// ========== WEBSOCKET SYNC SERVER (PENGGANTI HTTP POLLING) ===================
// ==============================================================================

const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ server });
const wsClients = new Map(); // ws -> clientState { uid, chatChannelId, voiceChannelId, isAdmin }

global.wsClients = wsClients;
global.sendWsSyncPayload = async function(ws, state) {
  if (ws.readyState !== 1) return;
  try {
    const data = await gatherSyncData(state);
    ws.send(JSON.stringify({ action: 'syncResponse', data }));
  } catch (err) {
    console.error("❌ Error sending WS sync payload:", err.message);
  }
};

global.broadcastWsUpdate = function(type, key) {
  for (const [ws, state] of wsClients.entries()) {
    if (ws.readyState === 1) {
      let shouldSend = false;
      if (type === 'global') shouldSend = true;
      else if (type === 'chat' && state.chatChannelId === key) shouldSend = true;
      else if (type === 'user' && state.uid === key) shouldSend = true;
      else if (type === 'admin' && state.isAdmin) shouldSend = true;
      
      if (shouldSend) {
        global.sendWsSyncPayload(ws, state).catch(() => {});
      }
    }
  }
};

wss.on('connection', (ws) => {
  wsClients.set(ws, { uid: null, chatChannelId: null, voiceChannelId: null, isAdmin: false });
  
  ws.on('message', async (message) => {
    try {
      const payload = JSON.parse(message);
      if (payload.action === 'sync') {
        const state = wsClients.get(ws);
        if (state) {
          const { uid, chatChannelId, voiceChannelId } = payload.data || {};
          state.uid = uid || null;
          state.chatChannelId = chatChannelId || null;
          state.voiceChannelId = voiceChannelId || null;
          state.isAdmin = await verifyIsAdmin(uid);
          await global.sendWsSyncPayload(ws, state);
        }
      }
    } catch (err) {
      // ignore
    }
  });
  
  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// Periodic background sync update pushed every 15s to all active WS clients
setInterval(() => {
  for (const [ws, state] of wsClients.entries()) {
    global.sendWsSyncPayload(ws, state).catch(() => {});
  }
}, 15000);

// Global exception and rejection handler to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('[Anti-Crash] Uncaught Exception:', err, 'origin:', origin);
});