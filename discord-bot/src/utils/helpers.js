const state = require('./state');

class MemoryCache {
  constructor() {
    this._store = new Map();
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

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Strip control chars
    .trim()
    .slice(0, maxLen);
}

function getDeterministicValue(id, key, min, max) {
  let hash = 0;
  const str = id + key;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return min + (hash % (max - min + 1));
}

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
        const user = await state.client.users.fetch(userId).catch(() => null);
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

async function verifyIsAdmin(uid) {
  if (!uid) return false;

  const cacheKey = `is_admin:${uid}`;
  if (state.cache) {
    const cached = state.cache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  }

  let isAdmin = false;

  // 2. Hardcoded Admin IDs
  let discordId = null;
  const match = uid.match(/\d{17,20}/);
  if (match) discordId = match[0];
  
  if (discordId && (
    discordId === "661135501226672129" || 
    discordId === "1410583272173600819" || 
    discordId === "588988763204616214" || 
    discordId === "331053654318776320"
  )) {
    isAdmin = true;
  } else {
    // 3. Local users lookup (require inside function to prevent circular dependency at import time)
    try {
      const dbHelper = require('./db');
      const localUsers = dbHelper.loadLocalUsers();
      const userData = localUsers[uid];
      if (userData && (
        userData.role === "Volunteer Theater" || 
        userData.role === "Ketua Kerupuk" || 
        userData.role === "Ketua Keripik"
      )) {
        isAdmin = true;
      }
    } catch (e) {
      console.warn("Gagal cek local users di verifyIsAdmin:", e.message);
    }

    // 4. Firestore fallback
    if (!isAdmin && state.db) {
      const { doc, getDoc } = require('firebase/firestore');
      try {
        const userDoc = await state.withTimeout(getDoc(doc(state.db, "users", uid)), 1000);
        if (userDoc && userDoc.exists()) {
          const userData = userDoc.data();
          const role = userData?.role;
          if (role === "Volunteer Theater" || role === "Ketua Kerupuk" || role === "Ketua Keripik") {
            isAdmin = true;
          }
        }
      } catch (e) {
        console.error("Gagal verifikasi admin via Firestore:", e.message);
      }
    }

    // 5. Discord API fallback
    const GUILD_ID = process.env.GUILD_ID;
    if (!isAdmin && state.isDiscordReady && state.client && discordId && GUILD_ID) {
      try {
        const guild = await state.client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member) {
          const hasAdminRole = member.roles.cache.some(r => 
            r.name.toLowerCase().includes('volunteer') || 
            r.name.toLowerCase().includes('ketua') || 
            member.permissions.has('Administrator')
          );
          if (hasAdminRole) {
            isAdmin = true;
          }
        }
      } catch (e) {
        console.error("Gagal verifikasi admin via Discord:", e.message);
      }
    }
  }

  if (state.cache) {
    state.cache.set(cacheKey, isAdmin, 60);
  }

  return isAdmin;
}

module.exports = {
  MemoryCache,
  sanitizeString,
  getDeterministicValue,
  resolveMentions,
  verifyIsAdmin
};
