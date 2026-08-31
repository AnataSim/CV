#!/usr/bin/env node
/**
 * update-fuzu-avatar.js
 * Fetch Discord avatar hash for fuzusovereign via Discord API,
 * then update Firestore users collection with the real avatar URL.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');
const https = require('https');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const FUZU_DISCORD_ID = '820154491654504458';
const FUZU_USER_KEY = `fuzu-discord-${FUZU_DISCORD_ID}`;

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function discordGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v10${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'User-Agent': 'CrunchyVerse/1.0'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Derive default avatar by snowflake (no bot token needed for default)
  const defaultIndex = (BigInt(FUZU_DISCORD_ID) >> 22n) % 6n;
  let avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;

  if (DISCORD_TOKEN) {
    console.log('🔑 Bot token found — fetching real Discord avatar...');
    try {
      const user = await discordGet(`/users/${FUZU_DISCORD_ID}`);
      if (user.avatar) {
        const ext = user.avatar.startsWith('a_') ? 'gif' : 'webp';
        avatarUrl = `https://cdn.discordapp.com/avatars/${FUZU_DISCORD_ID}/${user.avatar}.${ext}?size=128`;
        console.log(`✅ Real avatar found: ${user.avatar}`);
      } else {
        console.log('ℹ️  No custom avatar, using default Discord avatar');
      }
    } catch (err) {
      console.warn('⚠️  Failed to fetch Discord avatar:', err.message);
    }
  } else {
    console.log('ℹ️  No DISCORD_TOKEN in env — using computed default Discord avatar');
  }

  console.log(`\n🖼️  Avatar URL: ${avatarUrl}`);

  // Update Firestore
  const update = { avatar: avatarUrl };
  for (const key of [FUZU_USER_KEY, FUZU_DISCORD_ID]) {
    await setDoc(doc(db, 'users', key), update, { merge: true });
    console.log(`✅ Updated users/${key}.avatar`);
  }

  console.log('\n🎉 Avatar Fuzu berhasil diperbarui di Firestore!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
