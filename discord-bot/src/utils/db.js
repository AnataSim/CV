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

  const cacheKey = `user_deck:${uid}`;
  const cachedDeck = state.cache ? state.cache.get(cacheKey) : null;
  if (cachedDeck) {
    return cachedDeck;
  }

  const decks = loadLocalDecks();
  const localDeck = decks[uid];
  
  if (localDeck && localDeck.dealt) {
    if (state.cache) state.cache.set(cacheKey, localDeck, 30);
    return localDeck;
  }

  if (state.db) {
    const { doc, getDoc } = require('firebase/firestore');
    try {
      const deckRef = doc(state.db, "user_decks", uid);
      const deckDoc = await state.withTimeout(getDoc(deckRef), 500);
      if (deckDoc && deckDoc.exists()) {
        const deckData = deckDoc.data();
        decks[uid] = deckData;
        saveLocalDecks(decks);
        if (state.cache) state.cache.set(cacheKey, deckData, 30);
        return deckData;
      }
    } catch (e) {
      console.warn(`⚠️ [Firebase] Gagal fetch deck untuk ${uid} dari Firestore:`, e.message);
    }
  }

  const finalDeck = localDeck || { uid, dealt: false, cards: [], statuses: {} };
  if (state.cache) state.cache.set(cacheKey, finalDeck, 10);
  return finalDeck;
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
  saveLiveAnnouncement
};
