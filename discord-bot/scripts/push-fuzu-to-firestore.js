#!/usr/bin/env node
/**
 * push-fuzu-to-firestore.js
 * Script untuk recovery data fuzusovereign langsung ke Firestore.
 * Jalankan sekali: node discord-bot/scripts/push-fuzu-to-firestore.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, doc, setDoc, collection, getDocs, writeBatch } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

console.log('🔥 Connecting to Firebase project:', firebaseConfig.projectId);

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase config tidak lengkap! Pastikan .env.local terisi.');
  process.exit(1);
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// ============================================================
// DATA RECOVERY - fuzusovereign (Discord: 820154491654504458)
// ============================================================
const FUZU_DISCORD_ID = '820154491654504458';
const FUZU_USER_KEY = `fuzu-discord-${FUZU_DISCORD_ID}`;

const fuzuSubmissions = [
  {
    id: 'sub-1780834115234-fuzu-1',
    userId: FUZU_USER_KEY,
    discordId: FUZU_DISCORD_ID,
    username: 'Fuzu',
    userEmail: 'discord-fuzusovereign@crunchyverse.com',
    questId: 'quest-1780834115234-273',
    originalQuestId: 'quest-1780834115234-273',
    questName: 'SPD 160+',
    points: 10,
    status: 'approved',
    submittedAt: '2026-08-31T04:13:36.000Z',
    createdAt: '2026-08-31T04:13:36.000Z',
  },
  {
    id: 'sub-1780834229446-fuzu-2',
    userId: FUZU_USER_KEY,
    discordId: FUZU_DISCORD_ID,
    username: 'Fuzu',
    userEmail: 'discord-fuzusovereign@crunchyverse.com',
    questId: 'quest-1780834229446-915',
    originalQuestId: 'quest-1780834229446-915',
    questName: 'CDM 180%+',
    points: 10,
    status: 'approved',
    submittedAt: '2026-08-31T04:16:18.000Z',
    createdAt: '2026-08-31T04:16:18.000Z',
  },
  {
    id: 'sub-1780834247255-fuzu-3',
    userId: FUZU_USER_KEY,
    discordId: FUZU_DISCORD_ID,
    username: 'Fuzu',
    userEmail: 'discord-fuzusovereign@crunchyverse.com',
    questId: 'quest-1780834247255-921',
    originalQuestId: 'quest-1780834247255-921',
    questName: 'CDM 245%+',
    points: 10,
    status: 'approved',
    submittedAt: '2026-08-31T04:17:26.000Z',
    createdAt: '2026-08-31T04:17:26.000Z',
  },
];

const fuzuDeck = {
  uid: FUZU_USER_KEY,
  dealt: true,
  cards: [
    { id: 'quest-1780834115234-273', akt: 'Build', title: 'SPD 160+', description: 'Build Character Apapun dengan Stats Speed 160+', difficulty: 'Mudah', points: 10 },
    { id: 'quest-1780834229446-915', akt: 'Build', title: 'CDM 180%+', description: 'Build Character Apapun dengan Stats Crit Damage 180%+', difficulty: 'Mudah', points: 10 },
    { id: 'quest-1780834247255-921', akt: 'Build', title: 'CDM 245%+', description: 'Build Character Apapun dengan Stats Crit Damage 245%+', difficulty: 'Sulit', points: 10 },
  ],
  statuses: {
    'quest-1780834115234-273': 'Completed',
    'quest-1780834229446-915': 'Completed',
    'quest-1780834247255-921': 'Completed',
  },
};

const fuzuUser = {
  uid: FUZU_USER_KEY,
  discordId: FUZU_DISCORD_ID,
  name: 'Fuzu',
  displayName: '[aFuzu IX] | 283 ☀️',
  username: 'fuzusovereign',
  email: 'discord-fuzusovereign@crunchyverse.com',
  role: 'Penonton Teater',
  cv: 30,
  points: 30,
};

async function pushToFirestore() {
  try {
    console.log('\n📤 [1/3] Pushing submissions ke Firestore...');
    for (const sub of fuzuSubmissions) {
      await setDoc(doc(db, 'submissions', sub.id), sub, { merge: true });
      console.log(`  ✅ ${sub.id} (${sub.questName})`);
    }

    console.log('\n📤 [2/3] Pushing user_deck ke Firestore...');
    await setDoc(doc(db, 'user_decks', FUZU_USER_KEY), fuzuDeck, { merge: true });
    await setDoc(doc(db, 'user_decks', FUZU_DISCORD_ID), fuzuDeck, { merge: true });
    console.log(`  ✅ user_decks/${FUZU_USER_KEY}`);
    console.log(`  ✅ user_decks/${FUZU_DISCORD_ID}`);

    console.log('\n📤 [3/3] Pushing user profile ke Firestore...');
    await setDoc(doc(db, 'users', FUZU_USER_KEY), fuzuUser, { merge: true });
    await setDoc(doc(db, 'users', FUZU_DISCORD_ID), fuzuUser, { merge: true });
    console.log(`  ✅ users/${FUZU_USER_KEY}`);
    console.log(`  ✅ users/${FUZU_DISCORD_ID}`);

    console.log('\n🎉 RECOVERY BERHASIL! Data fuzusovereign sudah aman di Firestore.');
    console.log('   Submissions: 3/18 quest (SPD 160+, CDM 180%+, CDM 245%+)');
    console.log('   CV Points: 30 CV$');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Gagal push ke Firestore:', err.message);
    console.error(err);
    process.exit(1);
  }
}

pushToFirestore();
