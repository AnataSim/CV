const fs = require('fs');
const path = require('path');
const state = require('./state');

const SUBMISSIONS_FILE = path.join(__dirname, '../../database/submissions.json');
const DECKS_FILE = path.join(__dirname, '../../database/user_decks.json');
const QUESTS_FILE = path.join(__dirname, '../../database/quests.json');
const USERS_FILE = path.join(__dirname, '../../database/users.json');
const VOICE_AFK_CONFIG_FILE = path.join(__dirname, '../../database/voice-afk-config.json');
const GHOST_CONFIG_FILE = path.join(__dirname, '../../database/ghost-mode-config.json');
const LINKED_ACCOUNTS_FILE = path.join(__dirname, '../../database/linked-accounts.json');
const CUSTOM_CHANNELS_FILE = path.join(__dirname, '../../database/custom-channels.json');
const CHAT_MESSAGES_FILE = path.join(__dirname, '../../database/chat-messages.json');
const ACTIVE_CHANNELS_FILE = path.join(__dirname, '../../database/active-channels.json');
const VOLUNTEERABLES_FILE = path.join(__dirname, '../../database/volunteerables.json');
const LIVE_ANNOUNCEMENT_FILE = path.join(__dirname, '../../database/live-announcement.json');

// Ensure database directory exists
const dbDir = path.join(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

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
    if (state.cache && state.cache.deletePrefix) {
      state.cache.deletePrefix('user_deck:');
    }
  } catch (e) {
    console.error("Gagal menulis user_decks.json:", e.message);
  }
}

function loadLocalQuests() {
  try {
    if (fs.existsSync(QUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(QUESTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca quests.json:", e.message);
  }
  return [];
}

function saveLocalQuests(quests) {
  try {
    fs.writeFileSync(QUESTS_FILE, JSON.stringify(quests, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis quests.json:", e.message);
  }
}

// Low-level simple load to break cycle
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

function loadVoiceAfkConfig() {
  try {
    if (fs.existsSync(VOICE_AFK_CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(VOICE_AFK_CONFIG_FILE, 'utf8'));
      if (cfg && cfg.channelId) return cfg;
    }
  } catch (e) {
    console.error("Gagal membaca voice-afk-config.json:", e.message);
  }
  return {
    guildId: process.env.DISCORD_GUILD_ID || "661135501226672129",
    channelId: process.env.DISCORD_VOICE_CHANNEL_ID || "1435053596742914160",
    isConnected: true
  };
}

function saveVoiceAfkConfig(config) {
  try {
    fs.writeFileSync(VOICE_AFK_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis voice-afk-config.json:", e.message);
  }
}

function loadGhostConfig() {
  try {
    if (fs.existsSync(GHOST_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GHOST_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[KRPK-0421] Gagal baca ghost config:', e.message);
  }
  return null;
}

function saveGhostConfig(cfg) {
  try {
    fs.writeFileSync(GHOST_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('[KRPK-0421] Gagal simpan ghost config:', e.message);
  }
}

function loadLinkedAccounts() {
  try {
    if (fs.existsSync(LINKED_ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(LINKED_ACCOUNTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca linked-accounts.json:", e.message);
  }
  return {};
}

function saveLinkedAccounts(accounts) {
  try {
    fs.writeFileSync(LINKED_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis linked-accounts.json:", e.message);
  }
}

function loadCustomChannels() {
  try {
    if (fs.existsSync(CUSTOM_CHANNELS_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOM_CHANNELS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('❌ Error reading custom-channels.json:', e.message);
  }
  return [];
}

function saveCustomChannels(channels) {
  try {
    fs.writeFileSync(CUSTOM_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error writing custom-channels.json:', err.message);
  }
}

function loadChatMessages() {
  try {
    if (fs.existsSync(CHAT_MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(CHAT_MESSAGES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('❌ Error reading chat-messages.json:', err.message);
  }
  return null;
}

function saveChatMessages(messages) {
  try {
    fs.writeFileSync(CHAT_MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error writing chat-messages.json:', err.message);
  }
}

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

function getLiveAnnouncement() {
  try {
    if (fs.existsSync(LIVE_ANNOUNCEMENT_FILE)) {
      return JSON.parse(fs.readFileSync(LIVE_ANNOUNCEMENT_FILE, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal membaca live-announcement.json:", e.message);
  }
  return { lastLiveMessageId: null, lastLiveStatus: false };
}

function saveLiveAnnouncement(data) {
  try {
    fs.writeFileSync(LIVE_ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Gagal menulis live-announcement.json:", e.message);
  }
}

async function getUserDeck(uid) {
  if (!uid) return { uid, dealt: false, cards: [], statuses: {} };

  const cleanUid = String(uid).trim();
  const altUid = cleanUid.startsWith('sim-discord-')
    ? cleanUid.replace('sim-discord-', '')
    : `sim-discord-${cleanUid}`;

  const cacheKey = `user_deck:${cleanUid}`;
  const cachedDeck = state.cache ? state.cache.get(cacheKey) : null;
  if (cachedDeck) {
    return cachedDeck;
  }

  const decks = loadLocalDecks();
  let localDeck = decks[cleanUid] || decks[altUid];
  
  if (localDeck && localDeck.dealt) {
    if (state.cache) state.cache.set(cacheKey, localDeck, 30);
    return localDeck;
  }

  if (state.db) {
    const { doc, getDoc } = require('firebase/firestore');
    try {
      let deckRef = doc(state.db, "user_decks", cleanUid);
      let deckDoc = await state.withTimeout(getDoc(deckRef), 500);
      if ((!deckDoc || !deckDoc.exists()) && altUid) {
        deckRef = doc(state.db, "user_decks", altUid);
        deckDoc = await state.withTimeout(getDoc(deckRef), 500);
      }
      if (deckDoc && deckDoc.exists()) {
        const deckData = deckDoc.data();
        decks[cleanUid] = deckData;
        decks[altUid] = deckData;
        saveLocalDecks(decks);
        if (state.cache) state.cache.set(cacheKey, deckData, 30);
        return deckData;
      }
    } catch (e) {
      console.warn(`⚠️ [Firebase] Gagal fetch deck untuk ${cleanUid} dari Firestore:`, e.message);
    }
  }

  const finalDeck = localDeck || { uid: cleanUid, dealt: false, cards: [], statuses: {} };
  if (state.cache) state.cache.set(cacheKey, finalDeck, 10);
  return finalDeck;
}

async function syncLocalDataWithFirestore() {
  if (!state.db) return;
  const { collection, getDocs, doc, setDoc } = require('firebase/firestore');
  try {
    // 1. Submissions
    const localSubs = loadLocalSubmissions();
    const subsSnap = await state.withTimeout(getDocs(collection(state.db, "submissions")), 5000).catch(() => null);
    const map = new Map();
    if (subsSnap && !subsSnap.empty) {
      subsSnap.forEach(d => {
        const data = d.data();
        if (data && data.id) map.set(data.id, data);
      });
    }
    for (const sub of localSubs) {
      if (sub && sub.id) {
        if (!map.has(sub.id)) {
          map.set(sub.id, sub);
          await state.withTimeout(setDoc(doc(state.db, "submissions", sub.id), sub), 3000).catch(() => {});
        }
      }
    }
    const mergedSubs = Array.from(map.values());
    saveLocalSubmissions(mergedSubs);

    // 2. User Decks
    const localDecks = loadLocalDecks();
    const decksSnap = await state.withTimeout(getDocs(collection(state.db, "user_decks")), 5000).catch(() => null);
    const deckMap = { ...localDecks };
    if (decksSnap && !decksSnap.empty) {
      decksSnap.forEach(d => {
        const data = d.data();
        if (data && data.uid) {
          deckMap[data.uid] = { ...deckMap[data.uid], ...data };
        }
      });
    }
    for (const [k, deck] of Object.entries(localDecks)) {
      if (deck && deck.uid) {
        await state.withTimeout(setDoc(doc(state.db, "user_decks", k), deck), 3000).catch(() => {});
      }
    }
    saveLocalDecks(deckMap);

    // 3. Users
    const localUsers = loadLocalUsers();
    const usersSnap = await state.withTimeout(getDocs(collection(state.db, "users")), 5000).catch(() => null);
    const userMap = { ...localUsers };
    if (usersSnap && !usersSnap.empty) {
      usersSnap.forEach(d => {
        const data = d.data();
        if (data && data.uid) {
          userMap[data.uid] = { ...userMap[data.uid], ...data };
        }
      });
    }
    for (const [k, uData] of Object.entries(localUsers)) {
      if (uData && uData.uid) {
        await state.withTimeout(setDoc(doc(state.db, "users", k), uData), 3000).catch(() => {});
      }
    }
    saveLocalUsers(userMap);

    console.log("🔥 [FirestoreSync] Sync otomatis submissions, user_decks & users ke/dari Firestore sukses!");
  } catch (err) {
    console.warn("⚠️ [FirestoreSync] Error sync local data dengan Firestore:", err.message);
  }
}

module.exports = {
  loadLocalSubmissions,
  saveLocalSubmissions,
  loadLocalDecks,
  saveLocalDecks,
  loadLocalQuests,
  saveLocalQuests,
  loadLocalUsers,
  saveLocalUsers,
  loadVoiceAfkConfig,
  saveVoiceAfkConfig,
  loadGhostConfig,
  saveGhostConfig,
  loadLinkedAccounts,
  saveLinkedAccounts,
  loadCustomChannels,
  saveCustomChannels,
  loadChatMessages,
  saveChatMessages,
  loadActiveChannels,
  saveActiveChannels,
  loadLocalVolunteerables,
  saveLocalVolunteerables,
  getUserDeck,
  getLiveAnnouncement,
  saveLiveAnnouncement,
  syncLocalDataWithFirestore
};
